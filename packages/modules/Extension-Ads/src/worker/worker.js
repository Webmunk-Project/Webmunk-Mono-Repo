import TimeThrottler from './throttler.js';
import webRequest from './traffic.js';
import { RudderStack } from './rudderstack';

const extensionAdsAppMgr = {
  tabData: {},
  rudderStack: new RudderStack(),
  throttler: new TimeThrottler(1,200),
  initialize: async function() {
    self.messenger?.addReceiver('extensionAdsAppMgr', this);

    chrome.tabs.onRemoved.addListener((tabId) => delete this.tabData[tabId]);

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, { title, url, status }) => {
      // create or update tabData
      if (!this.tabData[tabId]) {
        this.tabData[tabId] = { ads: new Map(), title, url, status };
      } else if (status === 'loading') {
        this.tabData[tabId].ads.clear();
      } else {
        this.tabData[tabId] = { ...this.tabData[tabId], title, url, status };
      }
    });
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
  normalizeUrl(url, originUrl) {
    try {
      if (url.startsWith("//")) {
        let protocol = /^((http|https):)/.exec(originUrl)[1];

        return protocol + url;
      } else if (url.startsWith("/")) {
        let origin = /^(.*?:\/\/[^\/]+)/.exec(originUrl)[1];

        return origin + url;
      } else if (url.startsWith("url(")) {
        let matches = /url\("(.*)"\)/.exec(url);

        if (matches) return matches[1];
      } else if (url.startsWith("blob:")) {
        url = url.slice(5);
      }
    } catch (e) {
      console.log("Exception occurred while normalizing URL:", e);
    }
    return url;
  },
  prepareEventData(adData, pageUrl) {
    return {
      pageUrl: pageUrl,
      initialUrl: adData.initialUrl,
      redirected: adData.redirected,
      redirectedUrl: adData.redirectedUrl,
      content: adData.content,
    };
  },
  async sendAdsIfNeeded(tabId) {
    if (!this.tabData[tabId].ads.size) return;

    const newAds = Array.from(this.tabData[tabId].ads.values()).filter(ad => !ad.sentAt)

    if (!newAds.length) return;

    await Promise.all(
      newAds.map(async (ad) => {
        const eventData = this.prepareEventData(ad, this.tabData[tabId].url);
        await this.rudderStack.track(RudderStack.events.AD_DETECTED, eventData);
        ad.sentAt = Date.now();
      })
    );

    await this.rudderStack.flush();
  },
  async _onMessage_adContent(data, from) {
    const { id: tabId, url: tabUrl } = from.tab;
    const content = data?.content || data?.contentMain;
    const uniqueHrefs = new Set();

    if (!content) return;

    const promises = content.elts.map(async (item) => {
      let itemUrl = item.src || item.href;

      if (itemUrl && !itemUrl.startsWith("url(\"data")) {
        const normalizedUrl = this.normalizeUrl(itemUrl, tabUrl);

        if (!uniqueHrefs.has(normalizedUrl)) {
          uniqueHrefs.add(normalizedUrl);

          let result = await this.testRedirect(normalizedUrl);

          return { result, item };
        }
      }

      return null;
    });

    const results = (await Promise.all(promises)).filter(res => res !== null);

    results.forEach(({ result, item }) => {
      if (!result) return;

      this.tabData[tabId].ads.set(result.initialUrl, {
        initialUrl: result.initialUrl,
        redirected: result.redirected,
        redirectedUrl: result.redirected ? result.url : undefined,
        content: {
          type: item.type,
          src: item.src || item.href,
          title: item.title,
          text: item.text,
        }
      });
    });

    if (this.tabData[tabId].status === 'complete') {
      console.log(`%cReceiving ad from tab ${tabId} - ${tabUrl}, ads detected: ${this.tabData[tabId].ads.size}`, 'color: green; font-weight: bold');
      console.log('Tab data:', this.tabData[tabId]);
      await this.sendAdsIfNeeded(tabId);
    }
  },
  async _onMessage_adClicked(data, from) {
    if (data.content.clickedUrl) {
      console.log(`%cUser clicked on an ad: ${data.content.clickedUrl}`, 'color: orange');
    } else {
      console.log("Clicked URL not found.");
    }

    if (!data.content.clickedUrl) {
      console.log("Clicked URL not found.");
      return;
    }

    const { id: tabId, url: tabUrl } = from.tab;
    const normalizedUrl = this.normalizeUrl(data.content.clickedUrl, tabUrl);
    const result = await this.testRedirect(normalizedUrl);

    if (!result) return;

    const ad = {
      initialUrl: result.initialUrl,
      redirected: result.redirected,
      redirectedUrl: result.redirected ? result.url : undefined,
      content: data.content.elts,
    };

    const eventData = this.prepareEventData(ad, this.tabData[tabId].url);

    console.log(`%cUser clicked on an ad: ${data.content.clickedUrl}`, 'color: orange');
    console.log('Event data:', eventData);

    await this.rudderStack.track(RudderStack.events.AD_CLICKED, eventData);
    await this.rudderStack.flush();
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
        // console.log(`_onMessage_isDisplayNone ${JSON.stringify(path)} => ${result.isDisplayNone}`)
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
        // console.log(`_onMessage_parentFrameIsAnAd ${JSON.stringify(path)} => ${result.isAd}`)
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