'use strict';

const
  debug = require('debug')('kuzzle:plugins'),
  GatewayTimeoutError = require('kuzzle-common-objects').errors.GatewayTimeoutError,
  PluginImplementationError = require('kuzzle-common-objects').errors.PluginImplementationError,
  PluginContext = require('./pluginContext'),
  PrivilegedPluginContext = require('./privilegedPluginContext'),
  async = require('async'),
  path = require('path'),
  Promise = require('bluebird'),
  _ = require('lodash'),
  CircularList = require('easy-circular-list');

// cannot be constant: stubbed in unit tests
let
  fs = require('fs'),
  pm2 = require('pm2');

let
  pm2Promise = null;

/*
 We use the console to display information, as there may be no logger plugin available while installing/launching
 plugins
 */

/**
 * @param kuzzle
 * @constructor
 */
function PluginsManager (kuzzle) {
  this.kuzzle = kuzzle;
  this.plugins = {};
  this.pipes = {};
  this.controllers = {};
  this.routes = [];
  this.workers = {};
  this.config = kuzzle.config.plugins;
  this.silent = false;

  /**
   * Initialize configured plugin in config/defaultPlugins.json and config/customPlugins.json
   *
   * @param {object} [options]
   * @returns {Promise}
   */
  this.init = function pluginInit (options) {
    this.silent = options && options.silent;
    this.plugins = loadPlugins(this.config, this.kuzzle.rootPath);
  };

  this.getPluginsFeatures = function plugingetPluginsFeatures () {
    let pluginConfiguration = {};
    Object.keys(this.plugins).forEach(plugin => {
      let
        pluginInfo = this.plugins[plugin],
        p = {
          name: pluginInfo.name,
          version: pluginInfo.version,
          hooks: [],
          pipes: [],
          controllers: [],
          routes: []
        };

      if (pluginInfo.object) {
        if (pluginInfo.object.hasOwnProperty('hooks')) {
          p.hooks = _.uniq(Object.keys(pluginInfo.object.hooks));
        }

        if (pluginInfo.object.hasOwnProperty('pipes')) {
          p.pipes = _.uniq(Object.keys(pluginInfo.object.pipes));
        }

        if (pluginInfo.object.hasOwnProperty('controllers')) {
          p.controllers = _.uniq(Object.keys(pluginInfo.object.controllers));
          p.controllers = p.controllers.map((item) => pluginInfo.name + '/' + item);
        }

        if (pluginInfo.object.hasOwnProperty('routes')) {
          p.routes = _.uniq(pluginInfo.object.routes);
        }
      }
      else {
        console.warn(`no object found for plugin ${plugin}`);   // eslint-disable-line no-console
      }

      pluginConfiguration[plugin] = p;

      debug('[%s] loading configuration:\n%O', plugin, p);
    });

    return pluginConfiguration;
  };

  /**
   * Attach events hooks and pipes given by plugins
   */
  this.run = function pluginRun () {
    let pluginsWorker = _.pickBy(this.plugins, plugin => plugin.config.threads !== undefined);

    if (Object.keys(pluginsWorker).length > 0) {
      pm2Promise = pm2Init(this.workers, pluginsWorker, this.kuzzle.config);
    }

    return new Promise((resolve, reject) => {
      async.forEachOf(this.plugins, (plugin, pluginName, callback) => {
        const
          pipeWarnTime = this.config.common.pipeWarnTime,
          pipeTimeout = this.config.common.pipeTimeout;

        if (plugin.config.threads) {
          debug('[%s] starting worker with %d treads', pluginName, plugin.config.threads);

          initWorkers(plugin, pluginName, this.kuzzle.config)
            .then(() => callback())
            .catch(err => {
              this.silent || console.log('Plugin', pluginName, ' errored with message: ', err.message, '. Skipping...'); // eslint-disable-line no-console
              callback();
            });

          return true;
        }

        try {
          debug('[%s] starting plugin in %s mode', pluginName, plugin.config.privileged ? 'privileged' : 'standard');

          plugin.object.init(
            plugin.config,
            plugin.config.privileged ? new PrivilegedPluginContext(kuzzle) : new PluginContext(kuzzle)
          );
        }
        catch (e) {
          console.warn(`WARNING: Unable to init plugin ${pluginName}: ${e.message}`, e.stack); // eslint-disable-line no-console
          callback();
          return true;
        }

        if (plugin.object.hooks) {
          initHooks(plugin, kuzzle);
        }

        if (plugin.object.pipes) {
          initPipes(this, plugin, pipeWarnTime, pipeTimeout);
        }

        if (plugin.object.controllers) {
          initControllers(this.controllers, this.routes, plugin, pluginName);
        }

        if (plugin.object.scope) {
          injectScope(plugin.object.scope, kuzzle.passport);
        }

        debug('[%s] plugin started', pluginName);
        callback();
      }, (err) => {
        if (err) {
          return reject(err);
        }
        resolve({});
      });
    });
  };

  /**
   * Trigger an event for emit event and chain pipes
   *
   * @param {string} event
   * @param {*} data
   * @returns {Promise}
   */
  this.trigger = function pluginTrigger (event, data) {
    debug('trigger "%s" event', event);

    return triggerPipes(this.pipes, event, data)
      .then(modifiedData => {
        // Execute in parallel Hook and Worker because we don't have to wait or execute in a particular order
        return new Promise((resolve, reject) => {
          async.parallel([
            callback => triggerWorkers(this.workers, event, modifiedData).asCallback(callback),
            callback => triggerHooks(this.kuzzle, event, modifiedData).asCallback(callback)
          ], err => {
            if (err) {
              return reject(err);
            }

            resolve(modifiedData);
          });
        });
      });
  };

  /**
   * Inject plugin controllers within funnel Controller
   */
  this.injectControllers = function pluginInjectControllers () {
    _.forEach(this.controllers, (controller, name) => {
      kuzzle.funnel.controllers[name] = controller;
    });
  };
}


/**
 * Start the plugin worker with its configuration with PM2 when the connection is done
 *
 * @param {object} plugin
 * @param {string} pluginName
 * @param {object} kuzzleConfig
 */
function initWorkers (plugin, pluginName, kuzzleConfig) {
  return pm2Promise
    .then(() => {
      const pm2StartPromise = Promise.promisify(pm2.start, {context: pm2});

      return pm2StartPromise({
        name: kuzzleConfig.plugins.common.workerPrefix + pluginName,
        script: path.join(__dirname, 'pluginsWorkerWrapper.js'),
        execMode: 'cluster',
        instances: plugin.config.threads,
        killTimeout: plugin.config.killTimeout || 6000,
        maxMemoryRestart: plugin.config.maxMemoryRestart || '1G',
        watch: false
      });
    })
    .catch(err => {
      if (err) {
        return Promise.reject(new PluginImplementationError('Error while starting worker plugin: '.concat(pluginName)));
      }
    });
}

/**
 * Initialize the PM2 connection, create the communication bus and listen event.
 * When a worker is started, it sends the event "ready"
 *   Then, we send to this worker its configuration in order to let it initialize
 * When a worker is initialized, it sends the event "initialized"
 *   Then, we add it to the object `workers` with its PM2 id and attached events
 * When a worker is stopped (kill, crash, etc), we catch it with "process:event"
 *   Then, we remove the PM2 id from the list and clean the object `workers` if there is no more process in this cluster
 *
 * @param {object} workers - contains all cluster name, that contains all PM2 ids and events
 * @param {object} pluginsWorker - contains all plugin worker defined by user with config
 * @param {object} kuzzleConfig - Kuzzle configuration, used to construct a plugin context for workers plugins
 * @returns {Promise}
 */
function pm2Init (workers, pluginsWorker, kuzzleConfig) {
  return Promise.fromNode(callback => pm2.connect(callback))
    .then(() => Promise.fromNode(callback => pm2.list(callback)))
    .then(list => {
      const names = list
        .filter(process => process.name.indexOf(kuzzleConfig.plugins.common.workerPrefix) !== -1)
        .map(process => process.pm_id);

      return Promise.fromNode(asyncCB => async.each(names, (name, callback) => {
        pm2.delete(name, err => callback(err));
      }, err => asyncCB(err)));
    })
    .then(() => Promise.fromNode(callback => pm2.launchBus(callback)))
    .then(bus => {
      bus.on('ready', packet => {
        const
          pluginName = packet.process.name.replace(kuzzleConfig.plugins.common.workerPrefix, ''),
          kuzConfig = Object.assign({}, kuzzleConfig);

        // object property cannot be serialized
        Object.keys(kuzConfig.plugins).forEach(k => {
          kuzConfig.plugins[k].object = {};
        });

        if (!pluginsWorker[pluginName] || !pluginsWorker[pluginName].config) {
          return false;
        }

        pm2.sendDataToProcessId(packet.process.pm_id, {
          topic: 'initialize',
          data: {
            config: pluginsWorker[pluginName].config,
            path: pluginsWorker[pluginName].path,
            kuzzleConfig: kuzConfig
          }
        }, (err) => {
          if (err) {
            console.error(`ERROR: Unable to send data to plugin ${pluginName}: ${err.message}`, err.stack);  // eslint-disable-line no-console
          }
        });
      });


      bus.on('initialized', packet => {
        if (!workers[packet.process.name]) {
          workers[packet.process.name] = {pmIds: new CircularList(), events: []};
        }

        if (workers[packet.process.name].events.length === 0) {
          workers[packet.process.name].events = packet.data.events;
        }

        workers[packet.process.name].pmIds.add(packet.process.pm_id);
      });

      bus.on('process:event', packet => {
        if (packet.event) {
          if (packet.event === 'exit') {
            if (workers[packet.process.name]) {
              workers[packet.process.name].pmIds.remove(packet.process.pm_id);

              // /!\ We remove it only once from workers, exit event is received twice
              if (workers[packet.process.name].pmIds && workers[packet.process.name].pmIds.getSize() === 0) {
                delete workers[packet.process.name];
              }
            }
          }
        }
      });

      return Promise.resolve();
    })
    .catch(err => Promise.reject('Error with PM2', err));
}

/**
 * @param {PluginsManager} manager
 * @param plugin
 * @param pipeWarnTime
 * @param pipeTimeout
 */
function initPipes (manager, plugin, pipeWarnTime, pipeTimeout) {
  if (plugin.config && plugin.config.pipeWarnTime !== undefined) {
    pipeWarnTime = plugin.config.pipeWarnTime;
  }
  if (plugin.config && plugin.config.pipeTimeout !== undefined) {
    pipeTimeout = plugin.config.pipeTimeout;
  }

  _.forEach(plugin.object.pipes, (fn, pipe) => {
    if (Array.isArray(fn)) {
      fn
        .filter(target => typeof plugin.object[target] === 'function')
        .forEach(func => registerPipe(manager, plugin, pipeWarnTime, pipeTimeout, pipe, func));
    }
    else if (typeof plugin.object[fn] === 'function') {
      registerPipe(manager, plugin, pipeWarnTime, pipeTimeout, pipe, fn);
    }
  });
}

function initHooks (plugin, kuzzle) {
  _.forEach(plugin.object.hooks, (fn, event) => {
    if (Array.isArray(fn)) {
      fn
        .filter(target => typeof plugin.object[target] === 'function')
        .forEach(func => registerHook(kuzzle, plugin, event, func));
    }
    else if (typeof plugin.object[fn] === 'function') {
      registerHook(kuzzle, plugin, event, fn);
    }
  });
}

function initControllers (controllers, routes, plugin, pluginName) {
  let controllerImported = Object.keys(plugin.object.controllers).every(controller => {
    let description = plugin.object.controllers[controller];
    debug('[%s][%s] starting controller registration', plugin.name, controller);

    if (typeof description !== 'object' || description === null || Array.isArray(description)) {
      // eslint-disable-next-line no-console
      console.error(`[Plugin Manager] Error loading plugin ${pluginName}: incorrect controller description type (expected object): \n${description}`);
      return false;
    }

    return Object.keys(description).every(action => {
      debug('[%s][%s][%s] starting action controller registration', plugin.name, controller, action);

      if (typeof description[action] !== 'string' || description[action].length === 0) {
        // eslint-disable-next-line no-console
        console.error(`[Plugin Manager] Error loading ${pluginName}: invalid action description (expected non-empty string): ${action}`);
        return false;
      }

      if (!plugin.object[description[action]] || typeof plugin.object[description[action]] !== 'function') {
        // eslint-disable-next-line no-console
        console.error(`[Plugin Manager] Error loading ${pluginName}: action ${pluginName}.${description[action]} is not a function`);
        return false;
      }

      if (!controllers[`${pluginName}/${controller}`]) {
        controllers[`${pluginName}/${controller}`] = {};
      }

      controllers[`${pluginName}/${controller}`][action] = plugin.object[description[action]].bind(plugin.object);
      return true;
    });
  });

  if (!controllerImported) {
    Object.keys(plugin.object.controllers).forEach(controller => {
      delete controllers[`${pluginName}/${controller}`];
    });
  }
  else if (plugin.object.routes) {
    plugin.object.routes.forEach(route => {
      let valid = Object.keys(route).every(key => {
        if (['verb', 'url', 'controller', 'action'].indexOf(key) === -1) {
          // eslint-disable-next-line no-console
          console.error(`[Plugin Manager] Error initializing route ${route.url}: unknown route definition ${key}`);
          return false;
        }

        if (typeof route[key] !== 'string' || (route[key].length === 0 && key !== 'url')) {
          // eslint-disable-next-line no-console
          console.error(`[Plugin Manager] Error initializing route ${route.url}: ${key} must be a non-empty string`);
          return false;
        }

        return true;
      });

      if (valid) {
        if (!controllers[`${pluginName}/${route.controller}`]) {
          // eslint-disable-next-line no-console
          console.error(`[Plugin Manager] Error initializing route ${route.url}: undefined controller ${route.controller}`);
          return false;
        }

        if (!controllers[`${pluginName}/${route.controller}`][route.action]) {
          // eslint-disable-next-line no-console
          console.error(`[Plugin Manager] Error initializing route ${route.url}: undefined action ${route.action}`);
          return false;
        }

        if (['post', 'get'].indexOf(route.verb.toLowerCase()) === -1) {
          // eslint-disable-next-line no-console
          console.error(`[Plugin Manager] Error initializing route ${route.url}: only get and post actions are supported`);
          return false;
        }

        route.url = '/' + pluginName + route.url;
        route.controller = pluginName + '/' + route.controller;

        debug('[%s] binding HTTP route "%s" to controller "%s"', pluginName, route.url, route.controller);
        routes.push(route);
      }
    });
  }
}

/**
 * Emit event
 *
 * @param {EventEmitter} emitter
 * @param {string} event
 * @param {*} data
 * @returns {Promise}
 */
function triggerHooks(emitter, event, data) {
  emitter.emit(event, data);

  return Promise.resolve(data);
}

/**
 * Chain call all attached functions plugins on the specific event
 *
 * @param {object} pipes
 * @param {string} event
 * @param {*} data
 * @returns {Promise}
 */
function triggerPipes(pipes, event, data) {
  let preparedPipes = [];
  const wildcardEvent = getWildcardEvent(event);

  if (pipes && pipes[event] && pipes[event].length) {
    preparedPipes = pipes[event];
  }

  if (wildcardEvent && pipes && pipes[wildcardEvent] && pipes[wildcardEvent].length) {
    preparedPipes = preparedPipes.concat(pipes[wildcardEvent]);
  }

  if (preparedPipes.length === 0) {
    return Promise.resolve(data);
  }

  return new Promise((resolve, reject) => {
    async.waterfall([callback => callback(null, data)].concat(preparedPipes), (error, result) => {
      if (error) {
        return reject(error);
      }

      resolve(result);
    });
  });
}

/**
 * For a specific event, return the corresponding wildcard
 * @example
 *  getWildcardEvent('data:create') // return 'data:*'
 * @param {string} event
 * @returns {String|Boolean} wildcard event
 */
function getWildcardEvent (event) {
  const indexDelimiter = event.indexOf(':');
  if (indexDelimiter !== 1) {
    return event.substring(0, indexDelimiter+1) + '*';
  }

  return false;
}

/**
 * Send the event to next workers for each cluster that have defined the event
 *
 * @param {object} workers
 * @param {string} event
 * @param {object} data
 * @returns {Promise}
 */
function triggerWorkers(workers, event, data) {
  const wildcardEvent = getWildcardEvent(event);

  if (Object.keys(workers).length === 0) {
    return Promise.resolve(data);
  }

  return new Promise((resolve, reject) => {
    async.forEachOf(workers, (worker, workerName, callback) => {
      if (worker.events.indexOf(event) === -1 && worker.events.indexOf(wildcardEvent) === -1) {
        return callback();
      }

      let pmId = worker.pmIds.getNext();
      pm2.sendDataToProcessId(pmId, {
        topic: 'trigger',
        data: {
          event: event,
          message: data
        },
        id: pmId
      }, (err, res) => {
        callback(err, res);
      });
    }, (err) => {
      if (err) {
        return reject(err);
      }

      resolve(data);
    });
  });
}

/**
 * Loads installed plugins in memory
 *
 * @param {object} config - plugins configuration
 * @param {string} rootPath - Kuzzle root directory
 */
function loadPlugins(config, rootPath) {
  const pluginsDir = path.resolve(path.join(rootPath, 'plugins/enabled'));
  let loadedPlugins = {};

  const pluginList = fs.readdirSync(pluginsDir)
    .filter((element) => {
      const elStat = fs.statSync(path.join(pluginsDir, element));
      return elStat.isDirectory();
    });

  debug('loading plugins:\n%O', pluginList);

  pluginList.forEach((pluginDirName) => {
    const pluginPath = path.resolve(pluginsDir, pluginDirName);
    let plugin = null;

    try {
      if (fs.existsSync(path.resolve(pluginPath, 'package.json'))) {
        plugin = loadPluginFromPackageJson(path.resolve(pluginsDir, pluginDirName), config);
      } else {
        plugin = loadPluginFromDirectory(path.resolve(pluginsDir, pluginDirName), config);
      }
    } catch (e) {
      console.error(`Unable to load plugin ${pluginDirName}. ${e}`); // eslint-disable-line no-console
      return;
    }

    loadedPlugins[plugin.name] = plugin;
  });

  return loadedPlugins;
}

function loadPluginFromPackageJson(pluginPath, config) {
  const packageJson = require(path.resolve(pluginPath, 'package.json'));
  const PluginClass = require(pluginPath);

  debug('[%s] loading plugin from package.json file in directory "%s"', packageJson.name, pluginPath);

  return {
    name: packageJson.name,
    object: new PluginClass(),
    config: config[packageJson.name] || {},
    path: pluginPath
  };
}

function loadPluginFromDirectory(pluginPath, config) {
  const PluginClass = require(pluginPath);
  const pluginName = path.basename(pluginPath);

  debug('[%s] loading plugin from directory "%s"', pluginName, pluginPath);

  return {
    name: pluginName,
    object: new PluginClass(),
    config: config[pluginName] || {},
    path: pluginPath
  };
}

/**
 * Register a pipe function on an event
 * @param {PluginsManager} manager
 * @param {object} plugin
 * @param {number} warnDelay - delay before a warning is issued
 * @param {number} timeoutDelay - delay after which the function is timed out
 * @param {string} event name
 * @param {function} fn - function to attach
 */
function registerPipe(manager, plugin, warnDelay, timeoutDelay, event, fn) {
  debug('[%s] register pipe on event "%s"', plugin.name, event);

  if (!manager.pipes[event]) {
    manager.pipes[event] = [];
  }

  manager.pipes[event].push((data, callback) => {
    let
      pipeWarnTimer,
      pipeTimeoutTimer,
      timedOut = false;

    if (warnDelay) {
      pipeWarnTimer = setTimeout(() => {
        manager.trigger('log:warn', `Pipe plugin ${plugin.name} exceeded ${warnDelay}ms to execute.`);
      }, warnDelay);
    }

    if (timeoutDelay) {
      pipeTimeoutTimer = setTimeout(() => {
        let errorMsg = `Timeout error. Pipe plugin ${plugin.name} exceeded ${timeoutDelay}ms to execute. Aborting pipe`;
        manager.trigger('log:error', errorMsg);

        timedOut = true;
        callback(new GatewayTimeoutError(errorMsg));
      }, timeoutDelay);
    }

    try {
      plugin.object[fn](data, (err, object) => {
        if (pipeWarnTimer !== undefined) {
          clearTimeout(pipeWarnTimer);
        }
        if (pipeTimeoutTimer !== undefined) {
          clearTimeout(pipeTimeoutTimer);
        }

        if (!timedOut) {
          callback(err, object);
        }
      });
    }
    catch (error) {
      throw new PluginImplementationError(error);
    }
  });
}

/**
 * Register a listener function on an event
 *
 * @param {object} kuzzle instance
 * @param {object} plugin
 * @param {string} event
 * @param {function} fn - function to attach
 */
function registerHook(kuzzle, plugin, event, fn) {
  debug('[%s] register hook on event "%s"', plugin.name, event);

  kuzzle.on(event, (message) => {
    try {
      plugin.object[fn](message, event);
    }
    catch (error) {
      throw new PluginImplementationError(error);
    }
  });
}


/**
 * Injects a plugin's declared scopes into the Kuzzle passport wrapper
 *
 * @param {object} scope to inject, in the following format: {strategy: [scope, fields}, ...}
 * @param {object} passport wrapper object
 */
function injectScope(scope, passport) {
  Object.keys(scope).forEach(strategy => {
    // enforcing scope format
    if (typeof strategy === 'string' && Array.isArray(scope[strategy])) {
      passport.injectScope(strategy, scope[strategy]);
    }
  });
}

module.exports = PluginsManager;

