var
  Promise = require('bluebird'),
  BadRequestError = require('kuzzle-common-objects').errors.BadRequestError,
  _kuzzle;

/**
 * Clear Redis Caches
 *
 * @param {Request} request
 * @returns {Promise}
 */
function clearCache (request) {
  var
    cacheEngine,
    database = request.input.args.database || 'internalCache';

  cacheEngine = _kuzzle.services.list[database];
  if (cacheEngine === undefined) {
    return Promise.reject(new BadRequestError('Database '.concat(database, ' not found!')));
  }
  return new Promise((resolve, reject) => cacheEngine.flushdb(err => err ? reject(err) : resolve()));
}

/**
 * @param {Kuzzle} kuzzle
 * @returns {clearCache}
 */
module.exports = function cliClearCache (kuzzle) {
  _kuzzle = kuzzle;
  return clearCache;
};
