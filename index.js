const
  Kuzzle = require('./lib/core'),
  PluginContext = require('./lib/api/core/plugins/pluginContext');

/**
 * @param {string} rootPath
 * @param customConfiguration
 * @constructor
 */
function EntryPoint (rootPath, customConfiguration) {
  this.core = new Kuzzle(rootPath, customConfiguration);
  this.context = new PluginContext(this.core);
}

EntryPoint.prototype.start = function kuzzleStart () {
  this.core.start();
};

EntryPoint.prototype.registerPlugin = function kuzzleRegisterPlugin (pluginName, pluginConstructor, pluginConfig) {
  this.core.pluginsManager.registerPlugin(pluginName, pluginConstructor, pluginConfig);

  return this;
};

EntryPoint.prototype.registerThreadPlugin = function kuzzleRegisterThreadPlugin (pluginName, pluginPath, pluginConfig, threadCount) {
  this.core.pluginsManager.registerThreadPlugin(pluginName, pluginPath, pluginConfig, threadCount);

  return this;
};

module.exports = EntryPoint;