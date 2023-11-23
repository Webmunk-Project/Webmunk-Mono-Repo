
const removeJustifications = require("./scripts/mergeManifests").removeJustifications
  

let m = {
  "name": "Ad Scraper",
  "permissions": [{"name":"webRequest","justification":"to be reviewed"},
                  {"name":"storage","justification":"store all filters dictionaries"},
                  {"name":"unlimitedStorage","justification":"filters size goes beyond 5M"},
                  {"name":"webNavigation","justification":"required for iframes management"},
                  {"name":"privacy","justification":"used by ublock to customize network and services settings"}
                ],
  "host_permissions": []
};

let {processedManifestModule,modulePermissionJustifications} = removeJustifications(m)
console.log("final manifest: ",processedManifestModule)
console.log("final justifications: ",modulePermissionJustifications)
