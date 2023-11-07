const searchModulesInDirectory = require("./depsFromModules").searchModulesInDirectory
const { mergeWithCustomize } = require("@webmunk/manifest-merge")
const chalk = require('chalk');
const _ = require('lodash')
const util = require('util');
console.log("searchModulesInDirectory",searchModulesInDirectory);

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
exports.mergeManifests = function mergeManifests(scope,path,srcDir, baseManifestDir){
  let modules = searchModulesInDirectory(path+"/"+srcDir)
  console.log("Modules:"+modules)
  let manifest = require(`${path}/${baseManifestDir}/baseManifest.json`);
  modules.forEach(m => {
    const manifestModule = require(`${path}/node_modules/${scope}/${m}/module.json`);
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
          if (typeof a != "undefined" && typeof b!= "undefined" && a!=b) console.log(chalk.yellow(`Warning: field ${key} will be superseeded by ${b}`))
          // Fall back to default merging
          return undefined;
        }
      }
    )(manifest, manifestModule);
  })
  return manifest;
}