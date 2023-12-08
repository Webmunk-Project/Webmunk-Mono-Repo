// dont remove next line, all webmunk modules use messenger utility
import { messenger } from "@webmunk/utils"
import { wmSessionMgr } from '@webmunk/utils';


console.log("this is were you could import your webmunk modules worker scripts")
//import "@webmunk/${moduleName}/dist/worker.bundle"
//Example: import { extensionAdsAppMgr } from "@webmunk/extension-ads/worker.js";

const appMgr =  {
  initialize:function(){
    messenger?.addReceiver('appMgr', this);
    // by default, extension will fetch Ublock origin  assets file from the extension-embedded assets file
    // In case you want the paths to be remotely configured:
    // let's get where the assets file can be recovered from
    // let paths = await fetch("https://mydomain.com/api/getUblockAssetsPath"); 
    // paths should be an array like: 
    // ["https://webmunk1.com/WEBMUNK/assets.json","https://webmunk2.com/WEBMUNK/assets.json"]
    // extensionAdsAppMgr.setPossibleAssetsPaths(paths);
  },
  normalizeUrl:function(url,originUrl){
    try{
        if (url.startsWith("//")){
            let protocol = /((http|http)[s]?)/.exec(originUrl)[1];
            return protocol+":"+url; 
        }
        let matches = /url\("(.*)"\)/.exec(url)
        if (matches) return matches[1];
    }
    catch(e){}
    return url;
  },
  testRedirect: async function(url){
    //console.log(`testRedirect: url= ${url}`)
    let result = await fetch(url)
    .then(response => {
        return {
            success: true,
            redirected: response.redirected,
            url: response.url,
            initialUrl: url
        }
    })
    .catch(error => {
        console.error(`Exception: fetching for redirects ${url}`, error)
        return {
            success: false,
            url: url,
            initialUrl: url
        }
    });
    return result;
  },
  _onMessage_adContent(data, from){
    let promises = [];
    console.log(`Receiving ad content from ${from.frameId} url:${from.frameId==0?from.tab.url:from.frameId}`)
    data.content.elts.forEach((item) => {
        promises.push (new Promise(async resolve => {
            if (item.href && !item.href.startsWith("url(\"data")){
                let result = await this.testRedirect(this.normalizeUrl(item.href,from.tab.url));
                resolve(result)
            }
            else resolve(null)
        }))
    })
    Promise.all(promises).then(results => {
        results.forEach((result, index) => {
            if (result){
                data.content.elts[index].href = {
                    initialUrl: result.initialUrl,
                    redirected: result.redirected,
                    redirectedUrl: result.redirected ? result.url : undefined
                }
            }
        })
        console.log(`Ad content for ${wmSessionMgr.getSessionId(from.tab.id)}`,data.content)
    })
},
}
appMgr.initialize();