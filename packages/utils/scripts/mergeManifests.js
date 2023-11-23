const searchModulesInDirectory = require("./depsFromModules").searchModulesInDirectory
const { mergeWithCustomize } = require("@webmunk/manifest-merge")
const { merge } = require("@webmunk/manifest-merge")
const chalk = require('chalk');
const _ = require('lodash')
const util = require('util');
console.log("searchModulesInDirectory 1.0",searchModulesInDirectory);

function log(o){
  console.log(util.inspect(o, { depth: null }));
}

function removeDuplicateObjects(arr) {
  const uniqueObjects = [];
  const seenObjects = new Set();

  for (const obj of arr) {
    const objString = JSON.stringify(obj);
    if (!seenObjects.has(objString)) {
      seenObjects.add(objString);
      uniqueObjects.push(obj);
    }
  }
  return uniqueObjects;
}
exports.removeJustifications = function(manifest){
  let processedManifestModule = {};
  let modulePermissionJustifications = {};
  for (let prop in manifest){
    if (prop === "permissions"){
      processedManifestModule.permissions = [];
      manifest.permissions.forEach((p) => {
        processedManifestModule.permissions.push(p.name)
        if (p.justification){
          modulePermissionJustifications[p.name] = p.justification;
        }
      })
    }
    else processedManifestModule[prop] = manifest[prop]
  }
  return {processedManifestModule, modulePermissionJustifications};
}
exports.mergeManifests = function mergeManifests(scope,path,srcDir, baseManifestDir){
  let modules = searchModulesInDirectory(path+"/"+srcDir)
  let permissionJustifications = {};
  console.log("Modules1:"+modules)
  let manifest = require(`${path}/${baseManifestDir}/baseManifest.json`);
  modules.forEach(m => {
    const manifestModule = require(`${path}/node_modules/${scope}/${m}/module.json`);
    const {processedManifestModule, modulePermissionJustifications} = exports.removeJustifications(manifestModule);
    console.log("processedManifestModule = ",processedManifestModule)
    permissionJustifications = merge(permissionJustifications, modulePermissionJustifications)
    manifest = mergeWithCustomize(
      {
        customizeArray(a, b, key) {
          return removeDuplicateObjects([...a, ...b]);
        },
        customizeObject(a, b, key) {
          if (key === 'module') {
            // Custom merging
            return _.merge({}, a, b);
          }
    
          // Fall back to default merging
          return undefined;
        },
        customizePrimitive(a, b, key) {
          if (typeof a != "undefined" && typeof b!= "undefined" && a!=b){
            console.log(chalk.yellow(`Warning: trying to superseed field [${key}] by '${b}'`))
            return a;
          } 
          // Fall back to default merging
          return undefined;
        }
      }
    )(manifest, processedManifestModule);
  })
  return {manifest, permissionJustifications};
}