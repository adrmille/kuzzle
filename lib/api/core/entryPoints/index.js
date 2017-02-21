var KuzzleProxy = require('./kuzzleProxy');

/**
 * @param {Kuzzle} kuzzle
 * @constructor
 */
function EntryPoints (kuzzle) {
  this.kuzzle = kuzzle;
  this.proxy = new KuzzleProxy(kuzzle);
}

EntryPoints.prototype.init = function entryPointsInit () {
  console.log('DEBUG|KUZ: INIT PROXY ENTRY POINT')
  this.proxy.init();
};

module.exports = EntryPoints;
