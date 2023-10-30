const appMgr = {
  throttler: new TimeThrottler(1,200),
  initialize: async function() {
    messenger.addReceiver('appMgr', this);
  },
  captureRegion(){
      return chrome.tabs.captureVisibleTab().then( (imageUri) => {
          return {success:true, imageUri}
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
  }
};

appMgr.initialize();