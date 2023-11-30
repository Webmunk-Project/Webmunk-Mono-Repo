let isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
if (!isNode){
  exports.wmSessionMgr = require('./sessionMgr').wmSessionMgr
}
else {
  exports.mergeManifests = require('./scripts/mergeManifests.js').mergeManifests
  exports.copyDir = require('./scripts/copyDir').copyDir
}