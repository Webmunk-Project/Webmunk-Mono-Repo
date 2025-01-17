import TimeThrottler from './throttler.js';
import webRequest from './traffic.js';

const extensionAdsAppMgr = {
  throttler: new TimeThrottler(1,200),
  initialize: async function() {
    self.messenger?.addReceiver('extensionAdsAppMgr', this);
  },
  captureRegion(){
      return chrome.tabs.captureVisibleTab().then( (imageUri) => {
          return {success:true, imageUri}
      })
  },
  _onMessage_isFrameAnAd(_request, from){
      return chrome.tabs.sendMessage(from.tab.id,{action:"isFrameAnAd", frameId:from.frameId})
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
  _onMessage_youAreAFrameAd(data, from){
      chrome.tabs.sendMessage(from.tab.id,
          {action:"youAreAFrameAd"},
          {frameId: data.frameId}
      )
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
  _onMessage_captureRegion: function(request, _from) {
      return this.throttler.add(async () => {
          return this.captureRegion();
      }).then(result => {
          console.log(result);
          return result;
      });
  },
  _onMessage_getAllFrames(_request, from){
      return chrome.webNavigation.getAllFrames({tabId:from.tab.id}).then(frames => {
          return frames.filter(f => f.frameId!=0)
      });
  },
  _onMessage_isDisplayNone(_request, from){
    return chrome.webNavigation.getAllFrames({tabId:from.tab.id}).then(async frames => {
      let result ={success: true, isAd: false};
        let path = [from.frameId+"/false"];
        let cont = true;
        let myself = frames.find(f => f.frameId==from.frameId);
        while (cont){
          result = await self.messenger?.sendToMainPage(from.tab.id, "content", "isDisplayNone", from.frameId, myself.parentFrameId)
          path.unshift(myself.parentFrameId+"/"+result.isDisplayNone)
          if (result.isDisplayNone){
              result =  {success: true, isDisplayNone: true};
              cont = false;
          } 
          else{
              if (myself.parentFrameId == 0) cont = false;
              myself = frames.find(f => f.frameId==myself.parentFrameId);
          }
        }
        console.log(`_onMessage_isDisplayNone ${JSON.stringify(path)} => ${result.isDisplayNone}`)
        return result;
    });
  },
  _onMessage_parentFrameIsAnAd(_request, from){
      return chrome.webNavigation.getAllFrames({tabId:from.tab.id}).then(async frames => {
        let result ={success: true, isAd: false};
        let path = [from.frameId+"/false"];
        let cont = true;
        let myself = frames.find(f => f.frameId==from.frameId);
        while (cont){
          if (myself.parentFrameId ==0){
              result = await self.messenger?.sendToMainPage(from.tab.id, "content", "isFrameAnAd", from.frameId, 0) 
              path.unshift("0/"+(result.success ? result.isAd:"unknown"))
              cont = false;
          }
          else {
              result = await self.messenger?.sendToMainPage(from.tab.id, "content", "areYouAnAd", {}, myself.parentFrameId)
              path.unshift(myself.parentFrameId+"/"+result.isAd)
              if (result.isAd){
                  result =  {success: true, isAd: true};
                  cont = false;
              } 
              else{
                  myself = frames.find(f => f.frameId==myself.parentFrameId);
              }
          }
        }
        console.log(`_onMessage_parentFrameIsAnAd ${JSON.stringify(path)} => ${result.isAd}`)
        return result;
      })
  },
  _onMessage_retrieveContentScriptParameters: function(request, _from) {
      console.log("retrieveContentScriptParameters receiving message", request)
      const response = {
          collapseBlocked: true, //µb.userSettings.collapseBlocked,
          noGenericCosmeticFiltering: false,
          noSpecificCosmeticFiltering: false,
      };
  
      request.tabId = tabId;
      request.frameId = frameId;
      request.hostname = hostnameFromURI(request.url);
      request.domain = domainFromHostname(request.hostname);
      request.entity = entityFromDomain(request.domain);
  
      const scf = response.specificCosmeticFilters =
          cosmeticFilteringEngine.retrieveSpecificSelectors(request, response);
  },
  _onMessage_adDetected: async function(request, _from) {
      let results=[];
      let frameIdArray = Array.from(request.frameIds);
      for(let i=0; i<frameIdArray.length;i++){
          let frameId = frameIdArray[i];
          await chrome.tabs.sendMessage(from.tab.id,{action:"getIframeContent"},{frameId}).then(result =>{
              results.push(result)
          })
      }
      return {success:true, result:{main: request.main,frames:results}}
  },
  _onMessage_isUrlAnAds: async function(request, from){
    let details = {
        ...from,
        tabId: from.tab.id,
        type: "main_frame",
        method: "GET",
        requestId: Math.ceil(Math.random()*1000000)
    }
    let urlRefIsAnAd = false
    if (request.href){
      details.url = request.href
      urlRefIsAnAd = webRequest.testUrl(details)
    } 
    let urlSrcIsAnAd = false;
    if (request.src){
      details.url = request.src
      urlSrcIsAnAd = webRequest.testUrl(details)
    } 
    return {success:true, urlIsAnAd: urlRefIsAnAd||urlSrcIsAnAd}
  },
  setPossibleAssetsPaths:function(paths){
    if (self.µBlock && self.µBlock.setPossibleAssetsPaths) self.µBlock.setPossibleAssetsPaths(paths);
    else console.warn("EXCEPTION: extensionAdsAppMgr: no method for setting remote assets.json path")
  }
};

extensionAdsAppMgr.initialize();
exports.extensionAdsAppMgr = extensionAdsAppMgr;
