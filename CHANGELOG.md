*__note:__ the # at the end of lines are the pull request numbers on GitHub*

# 1.0.0-RC1

* Fix getServerInfo route #231
* Documentation about path in plugin configuration #228
* New memoryStorage controller, aliased to ms #224
* All redis commands are exposed, excepted: #224
  * script related commands
  * cluster related commands
  * pubsub commands
  * cursor commands
* ResponseObject now accepts a result that can be resolved to false #224
* Security routes fixes #225 :
   Fixes issue #215 and more: several security weren't returning any useful data in the response, namely updateRole, updateProfile, updateUser, and deleteUser
* Started to update repositories to make them return raw objects instead of ResponseObject. #225
* Removed useless MQ functional tests #223
* Prevent event loop saturation (see #217 for details)
* Fix problem with multi scope on same app #220
* Fixed performance issue + updated dependencies #216
  - Hydrated roles weren't stored in the profile cache, forcing a call to Elasticsearch on each request
  - Updated dependencies
  - Fixed breaking changes between lodash 3.10 and 4.6
  - Fixed new errors fired by ESLint 2
  - Deactivated ESLint `consistent-return` rule, as it appears to be bugged for the moment
  - Removed `async` use from `RequestObject.checkInformation`, as it was overkill
* Feature/docker switch to alpine #207
* small doc refactor #213
* Fix from/to dsl operators #211
* Beta fix admin user token #210
* Removed hardcoded loading of user admin in token repository #209
* Removed hardcoded loading of user admin #205
* fixes issue #199 #202
* Add enabled false on indexes in roles mapping #196
* Feature user rights documentation #195
* Reapply " Migration to ES 2.2" #201
* Enhance closures with fetch in users roles #183

# 1.0.0-beta.4

* updated dependency version for kuzzle-plugin-auth-passport-local #181
* refactor cli / first Admin creation process (add option to not reset roles/profiles) #182

# 1.0.0-beta.3

* Add auth:checkToken into the anonymous & default role

# 1.0.0-beta.1

* Fix bug on update role & profile #176

# 1.0.0-beta.0

* Kuzzle is now entering in beta! Feel free to contribute.

# 0.18.2

* Role serialization now allows indexing custom properties
* Fixed updateRole REST API route

# 0.18.1

* uniform response from createOrReplaceRole / createOrReplaceProfile

# 0.18.0

* Adds the first admin creation process to the CLI

# 0.17.5

* format user for serialization hydrate #170

# 0.17.4

* Bugfix: the token manager didn't check the availability of the connection part of a connection context before adding the token to the cache.

# 0.17.3

* Bugfix:remove bad return responseobject in createOrReplaceUser

# 0.17.2

* Bugfix on index creation rights

# 0.17.1

* Bugfix: Profile creation was not stopped when attempting to link to a non-existing role

# 0.17.0

* createRole & createProfile routes #160