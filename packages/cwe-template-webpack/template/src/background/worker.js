// dont remove next line, all webmunk modules use messenger utility
import { messenger } from "@webmunk/utils"
import { wmSessionMgr } from '@webmunk/utils';


console.log("this is were you could import your webmunk modules worker scripts")
//import "@webmunk/${moduleName}/dist/worker.bundle"
//Example: import { extensionAdsAppMgr } from "@webmunk/extension-ads/worker.js";

const appMgr =  {
  initialize:function(){
    messenger?.addReceiver('appMgr', this);
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