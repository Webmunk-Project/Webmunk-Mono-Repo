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
  async testRedirect(url) {
    const result = {
      redirected: false,
      redirectedUrl: null,
    };

    try {
      const res = await fetch(url);

      if (res.redirected) {
        result.redirected = true;
        result.redirectedUrl = res.url;
      } else {
        const text = await res.text();
        const match = text.match(/document\.location\.replace\("(.*)"\)/);

        if (match && match[1]) {
          result.redirected = true;
          result.redirectedUrl = match[1];
        } else {
          result.redirectedUrl = null;
        }
      }
    } catch (error) {
      console.log(`Exception fetching for redirects ${url}`, error);
    }

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
      url = url.trim().replace(/(\s\d+x,?)/g, '');

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
  contentFilterPredicate(item) {
    // TODO: move all content filters to this ONE place
    const url = item.src || item.href;
    return url && !url.startsWith("url(\"data");
  },
  async processAdData({ title, text, content }, tabUrl, clickedUrl) {
    const uniqueUrls = new Set();
    const allowedRedirectTypes = ['a', 'div'];
    const filteredContent = content.filter(this.contentFilterPredicate);

    const processedContent = await Promise.all(
      filteredContent.map(async (item) => {
        const itemUrl = item.src || item.href;
        const normalizedUrl = this.normalizeUrl(itemUrl, tabUrl);

        if (uniqueUrls.has(normalizedUrl)) return;

        uniqueUrls.add(normalizedUrl);

        let redirectResult = {};

        if (allowedRedirectTypes.includes(item.type)) {
          redirectResult = await this.testRedirect(normalizedUrl);
        }

        return { ...item, ...redirectResult, initialUrl: normalizedUrl };
      })
    );

    // Filter out any null values due to errors
    const filteredProcessedContent = processedContent.filter(result => !!result);

    // processedContent should already be properly sorted on the content script side, but we might need to add sorting here as well
    const successRedirectItem = filteredProcessedContent.find((item) => item.redirected);

    const clickedItem = clickedUrl
      && filteredProcessedContent.find((item) => item.initialUrl === clickedUrl);

    if (clickedUrl && !clickedItem) {
      console.warn('Clicked content is not found!');
    }

    const mainContentItem = clickedItem || successRedirectItem || filteredProcessedContent[0];
    const company = this.getCompanyName(mainContentItem.redirectedUrl || mainContentItem.initialUrl, title);

    return {
      title,
      company,
      text,
      initialUrl: mainContentItem.initialUrl,
      redirected: mainContentItem.redirected,
      redirectedUrl: mainContentItem.redirectedUrl,
      content: filteredProcessedContent
    };
  },
  getCompanyName(url, title) {
    const domain = (new URL(url)).hostname?.replace('www.', '');
    const mainDomain = domain.split('.')[0];

    // Based on research, domains with a length of 1 to 4 characters are typically not company names,
    // but common domain extensions (e.g., com, net, org, ru, ua).
    if (mainDomain.length >= 1 && mainDomain.length <= 4) {
      const sanitizedTitle = title.toLowerCase().replace(/(?<=\S)[^\w\s]+(?=\S)/gi, '');

      return this.getRecycledText(sanitizedTitle);
    }

    return this.getRecycledText(mainDomain);
  },
  getRecycledText(text) {
    return text
        .split(/[_.-]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
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
    const { meta, adsData } = data;

    if (!adsData.length) return;

    const results = await Promise.all(
      adsData.map(async (data) => {
        try {
          const result = await this.processAdData(data, tabUrl, null);

          return result;
        } catch (error) {

          return null;
        }
      })
    );

    results.forEach((result) => {
      if (result) {
        this.tabData[tabId].ads.set(result.initialUrl, result);
      }
    });

    if (this.tabData[tabId].status === 'complete') {
      console.log(`%cReceiving ad from tab ${tabId} - ${tabUrl}, ads detected: ${this.tabData[tabId].ads.size}`, 'color: green; font-weight: bold');
      console.log('Tab data:', this.tabData[tabId]);
      await this.sendAdsIfNeeded(tabId);
    }
  },
  async _onMessage_adClicked(data, from) {
    const { id: tabId, url: tabUrl } = from.tab;
    const { meta, adData, clickedUrl } = data;

    if (clickedUrl) {
      const result = await this.processAdData(adData, tabUrl, clickedUrl);
      const eventData = this.prepareEventData(result, tabUrl);

      console.log(`%cUser clicked on an ad: ${clickedUrl}`, 'color: orange');
      console.log('Event data:', eventData);

      await this.rudderStack.track(RudderStack.events.AD_CLICKED, eventData);
      await this.rudderStack.flush();
    } else {
      console.log("Clicked URL not found.");
    }
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