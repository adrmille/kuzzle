const
  Kuzzle = require('./index'),
  kuzzle = new Kuzzle({
    custom: 'configuration'
  }),
  authLocalPlugin = require('plugins/enabled/kuzzle-plugin-auth-passport-local'),
  loggerPlugin = require('plugins/enabled/kuzzle-plugin-logger');

kuzzle
  .addPlugin(authLocalPlugin, {})
  .addPlugin(loggerPlugin, {threads: 1})
  .start();
