import TimeThrottler from './throttler.js';
import webRequest from './traffic.js';
import { RateService } from './RateService.js';
import { v4 as uuidv4 } from 'uuid';
import filtersData from './url-filter.json';

const moduleEvents = Object.freeze({
  AD_DETECTED: 'ad_detected',
  AD_CLICKED: 'ad_clicked',
  ADS_RATED: 'ads_rated',
});

export const extensionAdsAppMgr = {
  tabData: {},
  eventEmitter: self.messenger.registerModule('ads-scraper'),
  throttler: new TimeThrottler(1,200),
  rateService: new RateService(),
  initialize: async function() {
    self.messenger.addReceiver('extensionAdsAppMgr', this);

    chrome.tabs.onRemoved.addListener((tabId) => delete this.tabData[tabId]);

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      const { title, url, status, openerTabId } = tab;

      // create or update tabData
      if (!this.tabData[tabId]) {
        const prevUrl = openerTabId && this.tabData[openerTabId] ? this.tabData[openerTabId].url : null;

        this.tabData[tabId] = { ads: new Map(), title, url, status, prevUrl: prevUrl };
      } else if (status === 'loading') {
        if (this.tabData[tabId].url !== url) {
          this.tabData[tabId].prevUrl = this.tabData[tabId].url;
        }
        this.tabData[tabId].ads.clear();
      }

      this.tabData[tabId] = { ...this.tabData[tabId], title, url, status };
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
      console.warn(`Exception fetching for redirects ${url}`, error);
    }

    return result;
  },
  _onMessage_youAreAFrameAd(data, from){
      chrome.tabs.sendMessage(from.tab.id,
          {action:"youAreAFrameAd"},
          {frameId: data.frameId}
      )
  },
  normalizeUrl(url, tabUrl) {
    try {
      const normalizedUrl = url.trim().replace(/(\s\d+x,?)/g, '');

      switch (true) {
        case (normalizedUrl.startsWith('//')): {
          const protocol = /^((http|https):)/.exec(tabUrl)[1];
          return protocol + normalizedUrl;
        }
        case (normalizedUrl.startsWith('/')): {
          const origin = /^(.*?:\/\/[^\/]+)/.exec(tabUrl)[1];
          return origin + normalizedUrl;
        }
        case (normalizedUrl.startsWith('url(')): {
          const matches = /url\('(.*)'\)/.exec(normalizedUrl);
          return matches?.length ? matches[1] : normalizedUrl;
        }
        case (normalizedUrl.startsWith('blob:')): {
          return normalizedUrl.slice(5);
        }
        default: {
          return normalizedUrl;
        }
      }
    } catch (e) {
      console.warn('Exception occurred while normalizing URL: ', e);
      return url;
    }
  },
  contentFilterPredicate(item) {
    const filters = filtersData.filters;
    const url = item.src || item.href;

     // Check if the URL contains any of the filter strings
    return url && !filters.some((filter) => url.includes(filter));
  },
  async processAdData({ title, text, content, coordinates }, tabUrl, clickedUrl) {
    const uniqueUrls = new Set();
    const allowedRedirectTypes = ['a', 'div'];
    const filteredContent = content.filter(this.contentFilterPredicate);
    const adId = uuidv4();

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

    if (!filteredProcessedContent.length) return;

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
      adId,
      text,
      coordinates,
      initialUrl: mainContentItem.initialUrl,
      redirected: mainContentItem.redirected,
      redirectedUrl: mainContentItem.redirectedUrl,
      content: filteredProcessedContent,
    };
  },
  getCompanyName(url, title) {
    const domain = (new URL(url)).hostname?.replace('www.', '');
    const mainDomain = domain.split('.')[0];

    // Based on research, domains with a length <=3 characters are typically not company names,
    // but common domain extensions (e.g., com, net, org, ru, ua).
    if (mainDomain.length <= 3) {
      const sanitizedTitle = title.toLowerCase().replace(/(?<=\S)[^\w\s]+(?=\S)/gi, '');

      return this.formatToPascalCase(sanitizedTitle);
    }

    return this.formatToPascalCase(mainDomain);
  },
  formatToPascalCase(text) {
    return text
        .split(/[_.-]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
  },
  prepareEventData(adData, pageUrl) {
    const {
      title,
      adId,
      company,
      text,
      coordinates,
      initialUrl,
      redirected,
      redirectedUrl,
      content,
    } = adData;

    return { pageUrl: pageUrl, title, company, text, coordinates, initialUrl, redirected, redirectedUrl, content, adId };
  },
  async rateAdsIfNeeded(tabId) {
    if (!this.tabData[tabId].ads.size) return;

    const response = await this.rateService.send(tabId);

    if (!response) return;

    const adIds = Array.from(this.tabData[tabId].ads.values()).map((ad) => ad.adId);

    this.eventEmitter.emit(moduleEvents.ADS_RATED, { mark: response, adIds });
  },
  sendAdsIfNeeded(tabId) {
    if (!this.tabData[tabId].ads.size) return;

    const newAds = Array.from(this.tabData[tabId].ads.values()).filter(ad => !ad.sentAt)

    if (!newAds.length) return;

    newAds.forEach((ad) => {
      const eventData = this.prepareEventData(ad, this.tabData[tabId].url);
      this.eventEmitter.emit(moduleEvents.AD_DETECTED, eventData);
      ad.sentAt = Date.now();
    })
  },
  async _onMessage_adContent(data, from) {
    const { id: tabId, url: tabUrl } = from.tab;
    const { meta, adsData } = data;

    if (!adsData.length) return;

    const results = await Promise.all(
      adsData.map(async (data) => await this.processAdData(data, tabUrl, null))
    );

    results.forEach((result) => {
      if (result) {
        this.tabData[tabId].ads.set(result.initialUrl, result);
      }
    });

    console.log(`%cReceiving ad from tab ${tabId} - ${tabUrl}, ads detected: ${this.tabData[tabId].ads.size}`, 'color: green; font-weight: bold');
    console.log('Tab data:', this.tabData[tabId]);
    this.rateAdsIfNeeded(tabId);
    this.sendAdsIfNeeded(tabId);
  },
  async _onMessage_adClicked(data, from) {
    const { id: tabId, url: tabUrl } = from.tab;
    const { meta, adData, clickedUrl } = data;

    const trackedAd = this.findTrackedAd(tabId, clickedUrl, adData);

    if (trackedAd) {
        const eventData = this.prepareEventData(trackedAd, tabUrl);
        console.log(`%cUser clicked on an ad: ${eventData.adId}`, 'color: orange');
        console.log('Event data:', eventData);
        this.eventEmitter.emit(moduleEvents.AD_CLICKED, eventData);
    } else {
        console.log("No tracked ad found for clicked URL.");
    }
  },
  findTrackedAd(tabId, clickedUrl, adData) {
    let trackedAd = this.tabData[tabId].ads.get(clickedUrl);

    // If not found, search all URLs in content
    if (!trackedAd && adData?.content) {
      const contentItem = adData.content.find((item) => {
        const { href, src, redirectedUrl, initialUrl } = item;
        const urlsToCheck = [href, src, redirectedUrl, initialUrl];

        return urlsToCheck.some((url) => url && this.tabData[tabId].ads.has(url));
      });

      if (contentItem) {
        const { href, src, redirectedUrl, initialUrl } = contentItem;
        const urlsToCheck = [href, src, redirectedUrl, initialUrl];
        trackedAd = this.tabData[tabId].ads.get(urlsToCheck.find((url) => url && this.tabData[tabId].ads.has(url)));
      }
    }

    return trackedAd;
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