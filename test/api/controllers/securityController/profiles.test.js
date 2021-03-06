var
  rewire = require('rewire'),
  should = require('should'),
  sinon = require('sinon'),
  sandbox = sinon.sandbox.create(),
  KuzzleMock = require('../../../mocks/kuzzle.mock'),
  Request = require('kuzzle-common-objects').Request,
  BadRequestError = require('kuzzle-common-objects').errors.BadRequestError,
  NotFoundError = require('kuzzle-common-objects').errors.NotFoundError,
  SizeLimitError = require('kuzzle-common-objects').errors.SizeLimitError,
  SecurityController = rewire('../../../../lib/api/controllers/securityController');

describe('Test: security controller - profiles', () => {
  var
    kuzzle,
    request,
    securityController;

  before(() => {
    kuzzle = new KuzzleMock();
    securityController = new SecurityController(kuzzle);
  });

  beforeEach(() => {
    request = new Request({controller: 'security'});
    kuzzle.internalEngine.get = sandbox.stub().returns(Promise.resolve({}));
    kuzzle.internalEngine.getMapping = sinon.stub().returns(Promise.resolve({internalIndex: {mappings: {profiles: {properties: {}}}}}));
    kuzzle.repositories.profile.buildProfileFromRequest = sandbox.stub().returns(Promise.resolve());
    kuzzle.repositories.profile.hydrate = sandbox.stub().returns(Promise.resolve());
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#updateProfileMapping', () => {
    var foo = {foo: 'bar'};

    it('should throw a BadRequestError if the body is missing', () => {
      return should(() => {
        securityController.updateProfileMapping(request);
      }).throw(BadRequestError);
    });

    it('should update the profile mapping', () => {
      request.input.body = foo;
      return securityController.updateProfileMapping(request)
        .then(response => {
          should(kuzzle.internalEngine.updateMapping).be.calledOnce();
          should(kuzzle.internalEngine.updateMapping).be.calledWith('profiles', request.input.body);

          should(response).be.instanceof(Object);
          should(response).match(foo);
        });
    });
  });

  describe('#getProfileMapping', () => {
    it('should fulfill with a response object', () => {
      return securityController.getProfileMapping(request)
        .then(response => {
          should(kuzzle.internalEngine.getMapping).be.calledOnce();
          should(kuzzle.internalEngine.getMapping).be.calledWith({index: kuzzle.internalEngine.index, type: 'profiles'});

          should(response).be.instanceof(Object);
          should(response).match({mapping: {}});
        });
    });
  });

  describe('#createOrReplaceProfile', () => {
    it('should resolve to an object on a createOrReplaceProfile call', () => {
      kuzzle.repositories.profile.validateAndSaveProfile = sandbox.stub().returns(Promise.resolve({_id: 'test', _source: {}}));

      return securityController.createOrReplaceProfile(new Request({_id: 'test', body: {policies: [{roleId: 'role1'}]}}))
        .then(response => {
          should(response).be.instanceof(Object);
          should(response._id).be.exactly('test');
        });
    });

    it('should reject with an object in case of error', () => {
      var error = new Error('Mocked error');

      kuzzle.repositories.profile.validateAndSaveProfile = sandbox.stub().returns(Promise.reject(error));

      return should(securityController.createOrReplaceProfile(new Request({_id: 'test', body: {policies: ['role1']}})))
        .be.rejectedWith(error);
    });
  });

  describe('#createProfile', () => {
    it('should reject when a profile already exists with the id', () => {
      var error = new Error('Mocked error');
      kuzzle.repositories.profile.validateAndSaveProfile = sandbox.stub().returns(Promise.reject(error));

      return should(securityController.createProfile(new Request({_id: 'test',body: {policies: ['role1']}})))
        .be.rejectedWith(error);
    });

    it('should resolve to an object on a createProfile call', () => {
      kuzzle.repositories.profile.validateAndSaveProfile = sandbox.stub().returns(Promise.resolve({_id: 'test', _source: {}}));

      return should(securityController.createProfile(new Request({_id: 'test', body: {policies: [{roleId:'role1'}]}})))
        .be.fulfilled();
    });

    it('should throw an error if creating a profile with bad roles property form', () => {
      return should(() => {
        securityController.createOrReplaceProfile(new Request({_id: 'badTest', body: {roleId: 'test', policies: 'not-an-array-roleIds'}}));
      }).throw(BadRequestError);
    });
  });

  describe('#getProfile', () => {
    it('should resolve to an object on a getProfile call', () => {
      kuzzle.repositories.profile.loadProfile = sandbox.stub().returns(Promise.resolve({_id: 'test', _source: {}}));

      return securityController.getProfile(new Request({_id: 'test'}))
        .then(response => {
          should(response).be.instanceof(Object);
          should(response._id).be.exactly('test');
        });
    });

    it('should throw an error on a getProfile call without id', () => {
      return should(() => {
        securityController.getProfile(new Request({_id: ''}));
      }).throw(BadRequestError);
    });

    it('should reject NotFoundError on a getProfile call with a bad id', () => {
      kuzzle.repositories.profile.loadProfile = sandbox.stub().returns(Promise.resolve(null));
      return should(securityController.getProfile(new Request({_id: 'test'}))).be.rejectedWith(NotFoundError);
    });
  });

  describe('#mGetProfiles', () => {
    it('should throw an error on a mGetProfiles call without ids', () => {
      return should(() => {
        securityController.mGetProfiles(new Request({body: {}}));
      }).throw(BadRequestError);
    });

    it('should reject with an object in case of error', () => {
      var error = new Error('Mocked error');

      kuzzle.repositories.profile.loadMultiFromDatabase = sandbox.stub().returns(Promise.reject(error));

      return should(securityController.mGetProfiles(new Request({body: {ids: ['test']}}))).be.rejectedWith(error);
    });

    it('should resolve to an object on a mGetProfiles call', () => {
      kuzzle.repositories.profile.loadMultiFromDatabase = sandbox.stub().returns(Promise.resolve([{_id: 'test', policies: [{roleId: 'role'}]}]));

      return securityController.mGetProfiles(new Request({body: {ids: ['test']}}))
        .then(response => {
          should(response).be.instanceof(Object);
          should(response.hits).be.an.Array();
          should(response.hits).not.be.empty();
          should(response.hits[0]).be.an.Object();
          should(response.hits[0]._source.policies).be.an.Array();
          should(response.hits[0]._source.policies[0]).be.an.Object();
          should(response.hits[0]._source.policies[0].roleId).be.an.String();
        });
    });

    it('should resolve to an object with roles on a mGetProfiles call with hydrate', () => {
      kuzzle.repositories.profile.loadMultiFromDatabase = sandbox.stub().returns(Promise.resolve([{_id: 'test', _source: {}}]));

      return securityController.mGetProfiles(new Request({
        body: {ids: ['test'], hydrate: true}
      }))
        .then(response => {
          should(response).be.instanceof(Object);
          should(response.hits).be.an.Array();
          should(response.hits).not.be.empty();
          should(response.hits[0]).be.an.Object();
        });
    });
  });

  describe('#searchProfiles', () => {
    it('should return an object containing an array of profiles on searchProfile call', () => {
      kuzzle.repositories.profile.searchProfiles = sandbox.stub().returns(Promise.resolve({hits: [{_id: 'test'}]}));

      return securityController.searchProfiles(new Request({
        body: {}
      }))
        .then(response => {
          should(response).be.instanceof(Object);
          should(response.hits).be.an.Array();
          should(response.hits[0]._id).be.exactly('test');
        });
    });

    it('should return a object containing an array of profiles on searchProfile call with hydrate', () => {
      kuzzle.repositories.profile.searchProfiles = sandbox.stub().returns(Promise.resolve({total: 1, hits: [{_id: 'test', policies: [ {roleId: 'default'} ]}]}));

      return securityController.searchProfiles(new Request({body: {policies: ['role1']}}))
        .then(response => {
          should(response).be.instanceof(Object);
          should(response.hits).be.an.Array();
          should(response.hits[0]._id).be.exactly('test');
          should(response.hits[0]._source.policies).be.an.Array();
          should(response.hits[0]._source.policies[0].roleId).be.exactly('default');
        });
    });

    it('should throw an error if the number of documents per page exceeds server limits', () => {
      kuzzle.config.limits.documentsFetchCount = 1;

      request = new Request({body: {policies: ['role1']}});
      request.input.args.from = 0;
      request.input.args.size = 10;

      return should(() => securityController.searchProfiles(request)).throw(SizeLimitError);
    });

    it('should reject an error in case of error', () => {
      var error = new Error('Mocked error');

      kuzzle.repositories.profile.searchProfiles = sandbox.stub().returns(Promise.reject(error));

      return should(securityController.searchProfiles(new Request({body: {policies: ['foo']}}))).be.rejectedWith(error);
    });
  });

  describe('#updateProfile', () => {
    it('should return a valid response', () => {
      kuzzle.repositories.profile.loadProfile = sandbox.stub().returns(Promise.resolve({}));
      kuzzle.repositories.profile.validateAndSaveProfile = sandbox.stub().returns(Promise.resolve({_id: 'test'}));

      return securityController.updateProfile(new Request({_id: 'test', body: {foo: 'bar'}}))
        .then(response => {
          should(response).be.instanceof(Object);
          should(response._id).be.exactly('test');
        });
    });

    it('should throw an error if no id is given', () => {
      return should(() => {
        securityController.updateProfile(new Request({body: {}}));
      }).throw(BadRequestError);
    });
  });

  describe('#deleteProfile', () => {
    it('should return an object with on deleteProfile call', () => {
      kuzzle.repositories.profile.deleteProfile = sandbox.stub().returns(Promise.resolve({_id: 'test'}));

      return securityController.deleteProfile(new Request({_id: 'test'}))
        .then(response => {
          should(response).be.instanceof(Object);
          should(response._id).be.exactly('test');
        });
    });

    it('should reject with an error in case of error', () => {
      var error = new Error('Mocked error');

      kuzzle.repositories.profile.deleteProfile = sandbox.stub().returns(Promise.reject(error));

      return should(securityController.deleteProfile(new Request({_id: 'test'}))).be.rejectedWith(error);
    });
  });

  describe('#getProfileRights', () => {
    it('should resolve to an object on a getProfileRights call', () => {
      kuzzle.repositories.profile.loadProfile = profileId => {
        return Promise.resolve({
          _id: profileId,
          _source: {},
          getRights: () => {
            return {
              rights1: {
                controller: 'read', action: 'get', index: 'foo', collection: 'bar',
                value: 'allowed'
              },
              rights2: {
                controller: 'write', action: 'delete', index: '*', collection: '*',
                value: 'conditional'
              }
            };
          }
        });
      };

      return securityController.getProfileRights(new Request({_id: 'test'}))
        .then(response => {
          var filteredItem;

          should(response).be.instanceof(Object);
          should(response.hits).be.an.Array();
          should(response.hits).length(2);

          filteredItem = response.hits.filter(item => {
            return item.controller === 'read' &&
                    item.action === 'get' &&
                    item.index === 'foo' &&
                    item.collection === 'bar';
          });
          should(filteredItem).length(1);
          should(filteredItem[0].value).be.equal('allowed');

          filteredItem = response.hits.filter(item => {
            return item.controller === 'write' &&
                    item.action === 'delete' &&
                    item.index === '*' &&
                    item.collection === '*';
          });
          should(filteredItem).length(1);
          should(filteredItem[0].value).be.equal('conditional');
        });
    });

    it('should throw an error on a getProfileRights call without id', () => {
      return should(() => {
        securityController.getProfileRights(new Request({_id: ''}));
      }).throw();
    });

    it('should reject NotFoundError on a getProfileRights call with a bad id', () => {
      kuzzle.repositories.profile.loadProfile = sandbox.stub().returns(Promise.resolve(null));

      return should(securityController.getProfileRights(new Request({_id: 'test'}))).be.rejectedWith(NotFoundError);
    });
  });

  describe('#mDeleteProfiles', () => {
    it('should call forward to mDelete', () => {
      SecurityController.__with__({
        mDelete: sinon.spy()
      })(() => {
        const
          mDelete = SecurityController.__get__('mDelete');

        securityController.mDeleteProfiles(request);

        should(mDelete)
          .be.calledOnce()
          .be.calledWith(kuzzle, 'profile', request);
      });
    });
  });
});
