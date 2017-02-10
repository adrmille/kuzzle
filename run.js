const
  Kuzzle = require('./index'),
  kuzzle = new Kuzzle(__dirname, {}),
  authLocalPlugin = require('plugins/enabled/kuzzle-plugin-auth-passport-local');

kuzzle
  .registerPlugin('kuzzle-plugin-auth-passport-local', authLocalPlugin, {})
  .registerThreadPlugin('kuzzle-plugin-logger', 'plugins/enabled/kuzzle-plugin-logger', {threads: 1})
  .start();
