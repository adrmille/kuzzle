var
  should = require('should'),
  BulkController = require('../../../lib/api/controllers/bulkController'),
  Request = require('kuzzle-common-objects').Request,
  PartialError = require('kuzzle-common-objects').errors.PartialError,
  KuzzleMock = require('../../mocks/kuzzle.mock');

describe('Test the bulk controller', () => {
  var
    controller,
    kuzzle,
    foo = {foo: 'bar'},
    request = new Request({controller: 'bulk', collection: 'unit-test-bulkController', body: {bulkData: 'fake'}}),
    stub;

  beforeEach(() => {
    kuzzle = new KuzzleMock();
    stub = kuzzle.services.list.storageEngine.import;
    controller = new BulkController(kuzzle);
  });

  it('should trigger the proper methods and resolve to a valid response', () => {
    return controller.import(request)
      .then(response => {
        var engine = kuzzle.services.list.storageEngine;

        should(engine.import).be.calledOnce();
        should(engine.import).be.calledWith(request);

        should(response).be.instanceof(Object);
        should(response).match(foo);
      });
  });

  it('should handle partial errors', () => {
    stub.returns(Promise.resolve({partialErrors: ['foo', 'bar']}));

    return controller.import(request)
      .then(response => {
        should(response).be.instanceof(Object);
        should(request.status).be.eql(206);
        should(request.error).be.instanceOf(PartialError);
      });
  });

});
