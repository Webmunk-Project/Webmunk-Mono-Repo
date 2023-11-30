import PostMessageMgr from './postMessage' 
import _ from 'lodash'

var options=null;
const debugLog = {
  traverse: false,
  highlighting:false,
  timeouts: false,
  hidden: true,
  noAd: true,
  registration: false,
}


if ( typeof vAPI === 'object' && !vAPI.contentScript ) {
  vAPI.contentScript = true;
  {
    let context = self;
    try {
        while (
            context !== self.top &&
            context.location.href.startsWith('about:blank') &&
            context.parent.location.href
        ) {
            context = context.parent;
        }
    } catch(ex) {
    }
    vAPI.effectiveSelf = context;
  }
  vAPI.userStylesheet = {
    added: new Set(),
    removed: new Set(),
    apply: function(callback) {
        if ( this.added.size === 0 && this.removed.size === 0 ) { return; }
        vAPI.messaging.send('vapi', {
            what: 'userCSS',
            add: Array.from(this.added),
            remove: Array.from(this.removed),
        }).then(( ) => {
            if ( callback instanceof Function === false ) { return; }
            callback();
        });
        this.added.clear();
        this.removed.clear();
    },
    add: function(cssText, now) {
        if ( cssText === '' ) { return; }
        this.added.add(cssText);
        if ( now ) { this.apply(); }
    },
    remove: function(cssText, now) {
        if ( cssText === '' ) { return; }
        this.removed.add(cssText);
        if ( now ) { this.apply(); }
    }
  };
  vAPI.SafeAnimationFrame = class {
    constructor(callback) {
        this.fid = this.tid = undefined;
        this.callback = callback;
    }
    start(delay) {
        if ( self.vAPI instanceof Object === false ) { return; }
        if ( delay === undefined ) {
          if ( this.fid === undefined ) {
            this.fid = requestAnimationFrame(( ) => { this.onRAF(); } );
          }
          if ( this.tid === undefined ) {
            this.tid = vAPI.setTimeout(( ) => { this.onSTO(); }, 20000);
          }
          return;
        }
        if ( this.fid === undefined && this.tid === undefined ) {
          this.tid = vAPI.setTimeout(( ) => { this.macroToMicro(); }, delay);
        }
    }
    clear() {
        if ( this.fid !== undefined ) {
            cancelAnimationFrame(this.fid);
            this.fid = undefined;
        }
        if ( this.tid !== undefined ) {
            clearTimeout(this.tid);
            this.tid = undefined;
        }
    }
    macroToMicro() {
        this.tid = undefined;
        this.start();
    }
    onRAF() {
        if ( this.tid !== undefined ) {
            clearTimeout(this.tid);
            this.tid = undefined;
        }
        this.fid = undefined;
        this.callback();
    }
    onSTO() {
        if ( this.fid !== undefined ) {
            cancelAnimationFrame(this.fid);
            this.fid = undefined;
        }
        this.tid = undefined;
        this.callback();
    }
  };

  const isFrame = () => window!==window.top
  const WAIT_BEFORE_EXTRACT = 2500;

  // vAPI.domWatcher
  const adsMgr = {
    addedNodeLists: [],
    addedNodes: [],
    removedNodeLists: [],
    domLayoutObserver: undefined,
    listenerIterator: [],
    listenerIteratorDirty: false,
    removedNodes: false,
    safeObserverHandlerTimer: undefined,
    ignoreTags: new Set([ 'br', 'head', 'link', 'meta', 'script', 'style' ]),
    listeners: [],
    cssSelectors: [],
    iframeSourceObserverOptions: {
      attributes: true,
      attributeFilter: [ 'src' ]
    },
    urlToIframeEltMap: new Map(),
    isAd: false,
    isVisible: true,
    actionsMessageMain: ['isFrameAnAd','isDisplayNone'],
    actionsMessageFrame: ['youAreAFrameAd','areYouAnAd','isDisplayNone'],
    frameId: null,

    initialize:async function(){
      chrome.runtime.onMessage.addListener(this._onBackgroundMessage.bind(this))        
      if(isFrame()){
        this.isAd = false;
        //console.log("Url of iframe="+document.URL)
        document.addEventListener('DOMContentLoaded', async (event) => {
          this.frameId = await chrome.runtime.sendMessage({action:"Messenger.getFrameId"});
          await this.wait(WAIT_BEFORE_EXTRACT)
          //document.body?.scrollIntoView()
          let response  = await chrome.runtime.sendMessage({action:"extensionAdsAppMgr.isDisplayNone",data:{}});
          if (response?.data?.isDisplayNone){
            debugLog.hidden && console.log(`extractContent: Iframe  is hidden ${this.frameId} `, window.document);
            return;
          }
          if (!this.isAd){
            let response  = await chrome.runtime.sendMessage({action:"extensionAdsAppMgr.parentFrameIsAnAd",data:{}});
            this.isAd = response.data.isAd;
          } 
          !this.isAd && debugLog.noAd && console.log(`extractContent: Iframe  is not an ad ${this.frameId} `, window.document);

          if (this.isAd){
            let content = this.extractContent(this.frameId);
            chrome.runtime.sendMessage({action:"extensionAdsAppMgr.adContent",data:{content}});
          }
        });
        this.postMessageMgr = new PostMessageMgr();
        this.frameId = await chrome.runtime.sendMessage({action:"Messenger.getFrameId"});
        //console.log(`extractContent: inserting listener ${this.frameId}`, window.document.URL, window.document);
      } 
      else{ // main frame
        document.addEventListener('DOMContentLoaded', async (event) => {
          await this.wait(2500)
          let adElements = document.querySelectorAll("[data-isad]")
          adElements.forEach(elt => {
            if (elt.localName != "iframe"){
              let content =this.extractContent(0,elt)
              chrome.runtime.sendMessage({action:"extensionAdsAppMgr.adContent",data:{content}});
            }
          })
        })
        this.postMessageMgr = new PostMessageMgr();
        this.postMessageMgr.setReceiver((data)=>this.mainReceivePostMessage(data))
      }
      this.iframeSourceObserver = new MutationObserver(this.iframeSourceModified);
    
      //vAPI.domMutationTime = Date.now();
      vAPI.domWatcher = { start: ()=>this.start(), addListener: () => addListener(), removeListener: ()=>removeListener() };
      /*chrome.runtime.sendMessage({action:'extensionAdsAppMgr.retrieveContentScriptParameters',
        data:{
          url: vAPI.effectiveSelf.location.href,
          needScriptlets: false,
        }
      }).then(response => {
          console.log(`vAPI.bootstrap[${vAPI.effectiveSelf.location.href}]:`,response && response.specificCosmeticFilters.injectedCSS)
          //this.onResponseReady(response);
      });*/
      vAPI.messaging.send('contentscript', {
        what: 'retrieveContentScriptParameters',
        url: vAPI.effectiveSelf.location.href,
        needScriptlets: typeof self.uBO_scriptletsInjected !== 'string',
      }).then(response => {
          //console.log(`vAPI.bootstrap[${vAPI.effectiveSelf.location.href}]:`,response.specificCosmeticFilters.injectedCSS)
          try{
            this.cssSelectors = response.specificCosmeticFilters? response.specificCosmeticFilters.specificSet:[];
          }
          catch(e){
            this.cssSelectors = []
          }
          this.onResponseReady(response);
          
      });
    }, 
    setIsad:function(value, reason){
      this.isAd=value;
      console.log(`setIsad ${this.frameId} [${reason}]:`,value)
    },
    _onBackgroundMessage(message, sender, reply) {
      let actionsMessage = isFrame() ? this.actionsMessageFrame : this.actionsMessageMain;
      if (!message.action || actionsMessage.indexOf(message.action) === -1) {
        return false
      }
      this[`_onMessage_${message.action}`](message, sender, reply)
      return true //async reply
    },
    _onMessage_isDisplayNone:function(msg,_from,reply){
      let result  = {success:false, reason:"frameid not found", isDisplayNone: false};
      try {
        let iframes = Array.from(document.querySelectorAll("iframe"));
        let iframe = iframes.find(f => f.getAttribute("frameid")== msg.data)
        if (iframe){
          if (iframe.style.display == "none"){
            result = {success:true, isDisplayNone: true}
          }
        } 
      }
      catch(e){
        result = e;
      }
      reply(result)
    },
    _onMessage_areYouAnAd:function(_msg,_from,reply){
      reply({isAd: this.isAd})
    },
    _onMessage_youAreAFrameAd:function(_msg,_from,reply){
      this.setIsad(true,"_onMessage_youAreAFrameAd");
      reply({success: true})
    },
    _onMessage_isFrameAnAd:function(msg,_from,reply){
      let result  = {success:false, reason:"frameid not found", isAd: false};
      try {
        let iframes = Array.from(document.querySelectorAll("iframe"));
        let iframe = iframes.find(f => f.getAttribute("frameid")== msg.data)
        if (iframe){
          if (iframe.style.display == "none"){
            result = {success:true, isAd: false, reason: "frame hidden"}
          }
          else {
            let parent = iframe.parentElement, count = 0;
            const MAX_PARENTS = 2;
            result = {success:true, isAd: iframe.getAttribute("data-isad")?true:false}
            while (!result.isAd && parent &&  count < MAX_PARENTS){
              result = {success:true, isAd: parent.getAttribute("data-isad")?true:false}
              parent = parent.parentElement;
              count ++;
            }
          }
        } 
      }
      catch(e){
        result = e;
      }
      reply(result)
    },
    mainReceivePostMessage:function(data){
      switch(data.action){
        case 'ready':
          debugLog.registration && console.log(`[${window.name} iframe ready `+data.data)
          break;
        case 'isIframeAnAd':
          let iframe = this.postMessageMgr.idToFrame(data.from)
          return iframe.ads;
      }
    },
    wait(delay){
      return new Promise(resolve => {
        setTimeout(()=>{
          resolve();
        }, delay)
      })
    },
    iframeSourceModified:function(mutations) {
      //JML 
      for ( const mutation of mutations ) {
        console.log("Iframe changing src "+mutation.target.src,mutation.target)
        //addIFrame(mutation.target, true);
      }
    },
    async captureToCanvas(regionElt) {
      let rect = regionElt.getBoundingClientRect()
      //await this.wait(4000)
      return chrome.runtime.sendMessage({action:"extensionAdsAppMgr.captureRegion", data:{region:rect}}).then( data => {
        console.log("captureToCanvas ",data)
      })
    },
    hasAnAdsParent:function(node, maxLevel=6){
      let i = 0;
      let parent = node;
      while (i< maxLevel && parent.parentElement != null){
        i++;
        parent = parent.parentElement;
        if (parent.hasAttribute("data-isad")) return true;
      }
      return false;
    },
    highlightNodeAsAds:async function(node, indent, selector, color){
      debugLog.highlighting && console.log(`Node matched: ${selector} ${document.URL} ${indent}`,node);
      if (!options){
        options = await chrome.storage.sync.get(['highlightAds'])
      }
      if (options.highlightAds){
        node.style.border=`dashed 2px ${color}`
        if (node.style.display != "none") node.style.display="inline-block"
        node.style.margin="2px"
        debugLog.highlighting && console.log("Highlighting ",node)
      }
      node.ads = true;
      node.setAttribute("data-isad",true)
      if (isFrame()){
        this.setIsad(true,"highlightNodeAsAds");
      }
    },
    traverseDOM:async function(node, indent = 0) {    
      let urlIsAnAd = false;
      if ( node.nodeType !== 1 ) return
      if ( this.ignoreTags.has(node.localName) ) return
      if (isFrame() && this.isAd) return;
      //if (indent == 0 && this.hasAnAdsParent(node)) return

      if (node.localName=="iframe" && this.hasAnAdsParent(node,1)){
        setTimeout(()=>{
          this.waitForFrameId(node).then( id => {
            console.log(`Setting Iframe[${node.getAttribute("frameid")}] to data-isad true `,node)
            node.setAttribute("data-isad", true)
            chrome.runtime.sendMessage({action:"extensionAdsAppMgr.youAreAFrameAd",data:{frameId:parseInt(id, 10)}})
          }).catch(e => {
            console.log(`Setting Iframe[UNKNOWN] to data-isad true `,node)
            node.setAttribute("data-isad", true)
          })
        },300)
      }

      //if ((node.href && typeof node.href != "object" && node.getAttribute("href").startsWith("http")) || (node.src && node.getAttribute("src").startsWith("http"))){ 
      if ((node.href && typeof node.href != "object") || (node.src)){ 
        //if (node.src) console.log(`${node.localName} Node has src `+node.src)
        //if (node.href) console.log(`${node.localName} Node has href `+node.href)
        urlIsAnAd = await chrome.runtime.sendMessage({action:"extensionAdsAppMgr.isUrlAnAds",data:{src: node.src, href: node.href}}).then(result=>{
          return result.data.urlIsAnAd;
        })
        if (urlIsAnAd && !(node.style.display=="none")){
          let parentFrameIsAnAd = false;
          // let's check if the found node is not already in an iframe detected as an ad
          if (isFrame()){
            console.log("Checking node for ad ascendance",node)
          }
          if (!parentFrameIsAnAd){
            this.highlightNodeAsAds(node, indent, "urlIsAnAd","red");
            //this.notifyForAd(node);
          }
        }
      }
      //if (!urlIsAnAd && node.nodeType === Node.ELEMENT_NODE) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        this.cssSelectors.forEach(async (selector) => {
          if (node.localName=="iframe") {

            this.iframeSourceObserver.observe(node, this.iframeSourceObserverOptions);}
          if (node.matches(selector) && !this.hasAnAdsParent(node)) {
            let parentFrameIsAnAd = false;
            if (isFrame()){
              console.log("Checking node for ad ascendance",node)
            }
            if (!parentFrameIsAnAd){
              this.highlightNodeAsAds(node, indent, selector, "blue");
              //this.captureToCanvas(node.parentElement)
              //this.notifyForAd(node);
            }
            
          }
          else {
            if (this.isAd && node.localName=="iframe"){
              node.setAttribute("data-isad",true)
              this.waitForFrameId(node).then((id) => {
                console.log("Telling iframe it is an ad "+node.id, node)
                chrome.runtime.sendMessage({action:"extensionAdsAppMgr.youAreAFrameAd",data:{frameId:parseInt(id, 10)}})
              });
            }
          }
        });
        //if (!node.hasAttribute("data-isad")) for (let i = 0; i < node.childNodes.length; i++) {
        for (let i = 0; i < node.childNodes.length; i++) {
          this.traverseDOM(node.childNodes[i], indent + 2);
        }
      }
    },
    waitForFrameId:function(node, count = 50){
      return new Promise((resolve,reject) => {
        let frameId = node.getAttribute("frameid")
        if (frameId) resolve(frameId);
        else{
          let intervalId = setInterval(()=>{
            let frameId = node.getAttribute("frameid")
            if (frameId){
              clearInterval(intervalId)
              resolve(frameId);
            } 
            if (count<0){
              clearInterval(intervalId);
              reject()
              //if (node.style.display!="none") console.warn("Clearing intervalId for frame, too many attempts ",node)
            }
            count --;
          }, 10)
        } 
      })
    },
    notifyForAd:function(node){
      let frameIds = [];
      if (node.localName=="iframe") {
        let frameId = node.getAttribute("frameid")
        if (frameId) frameIds.push(frameId)           
      }
      else{
        let iframes = node.querySelectorAll("iframe");
        if (iframes.length){
          Array.from(iframes).forEach(f => {
            let frameId = f.getAttribute("frameid");
            if (frameId) frameIds.push(frameId)           
          })
        }
      }
      chrome.runtime.sendMessage({action:"extensionAdsAppMgr.adDetected",data:{
        main:{
          tagName: node.localName,
          content: node.textContent,
          src: node.src? node.src : undefined,
          href: node.href? node.href : undefined,
        },
        frameIds
      }}).then(result => {
        console.log("Content sent for ad:",result)
      })
    },
    waitForContentWindow(node){
      let delay = 500;
      let count = 100;
      console.log("waitForContentWindow",node)
      return new Promise(resolve => {
        let timerId = setInterval(()=>{
          if (node.contentWindow || count < 0){
            if (count<0) console.log("Giving up on iframe",node)
            else console.log("waitForContentWindow ready",node)
            clearInterval(timerId);
            resolve()
          } 
          count --;
          delay = 10;   
        }, delay)
      }) 
    },
    getFrameId(node){
      if (node.contentWindow){
        //node.setAttribute("frameCorrelationId",frameCorrelationId)
        node.removeAttribute("sandbox");
        node.setAttribute("frameId","empty")

        try{
          console.log("safeObserverHandler: Sending to "+node.id)
        }
        catch(e){
          console.log("EXCEPTION ",e)
        }
        setTimeout(()=>{
          if (!node.getAttribute("frameId")){
            console.log("Failure getting frameId",node)
          }
        },1250)
        this.postMessageMgr.sendTo(node.contentWindow,"getFrameId",{}).then(data => {
          console.log("FrameId data:",node,data.frameId)
          node.setAttribute("frameId",data.frameId)
          node.frameId = data.frameId;
        })
      }
    },
    extractContent(frameId, elt){
      let content = [];
      let root = document;
      if (frameId == 0) root = elt;
      let imgArray = Array.from(root.querySelectorAll("img"));
      let aArray = Array.from(root.querySelectorAll("a"));
      let divArray = Array.from(root.querySelectorAll("div"));

      let scopeArray = [...imgArray, ...aArray];
      if (frameId == 0) scopeArray.push(root)
      scopeArray.forEach(i => {
        let src = i.getAttribute("src");
        let href = i.getAttribute("href");
        // let's avoid useless buttons
        if (!href || !href.startsWith("https://adssettings.google.com/whythisad")){
          let o = {elt:i, type:i.localName}
          src && (o.src = src);
          href && (o.href = href);
          content.push(o)
        }
      })
      divArray.forEach(i => {
        if (i.style.backgroundImage && i.style.backgroundImage!=""){
          content.push({elt:i, type:i.localName,href: i.style.backgroundImage})
        }
      })
      content = _.uniqWith(content,(o1,o2) => {
        for (let prop in o1){
          if (o1[prop] != o2[prop]) return false;
        }
        return true;
      })
      console.log(`extractContent: ${frameId}`,content,document)
      return {elts: content, documentUrl: document.URL};
    },
    safeObserverHandler:async function() {
        let i = 0;
        while ( this.addedNodeLists.length ) {
          const nodeList = this.addedNodeLists.shift();
          let iNode = 0;
          let nodeArray = Array.from(nodeList)
          while ( nodeArray.length ) {
            const node = nodeArray.shift();
            if (node.localName=="iframe" /*&& node.id.startsWith("google_ads_iframe_/22152718")*/){
              node.onload = () => {
                try{
                  /*setTimeout(async () => {                    
                    console.log("iframe onload",node, node.getAttribute("frameid"))
                    
                  }, (1000));*/
                }
                catch(e){}
              }
            }
            if (isFrame()){
              this.traverseDOM(node, 0);
            }
            else{
              debugLog.traverse && console.log(`Launching traverseDOM from top [id=${node.id}]`)
              this.traverseDOM(node, 0);
            } 
            iNode++;
          }
          i++;
        }
        this.addedNodeLists.length = 0;
        vAPI.domMutationTime = Date.now();
    },
    // https://github.com/chrisaljoudi/uBlock/issues/205
    //   Do not handle added node directly from within mutation observer.
    observerHandler:function(mutations) {
      let i = mutations.length;
      while ( i-- ) {
          const mutation = mutations[i];
          let nodeList = mutation.addedNodes;
          if ( nodeList.length !== 0 ) {
              this.addedNodeLists.push(nodeList);
          }
      }
      if ( this.addedNodeLists.length !== 0 ) {
          this.safeObserverHandlerTimer.start(
            this.addedNodeLists.length < 100 ? 1 : undefined
          );
      }
    },
    startMutationObserver:function() {
      //console.log("startMutationObserver..."+document.URL)
      if ( this.domLayoutObserver !== undefined ) { return; }
      this.domLayoutObserver = new MutationObserver((mutations)=> this.observerHandler(mutations));
      this.domLayoutObserver.observe(document, {
          //attributeFilter: [ 'class', 'id' ],
          //attributes: true,
          childList: true,
          subtree: true
      });
      this.safeObserverHandlerTimer = new vAPI.SafeAnimationFrame(() => this.safeObserverHandler());
      //vAPI.shutdown.add(cleanup);
    },
    stopMutationObserver:function() {
      console.log("...stopMutationObserver")

        if ( this.domLayoutObserver === undefined ) { return; }
        this.cleanup();
        vAPI.shutdown.remove(()=>cleanup());
    },
    getListenerIterator:function() {
      if ( this.listenerIteratorDirty ) {
          listenerIterator = this.listeners.slice();
          this.listenerIteratorDirty = false;
      }
      return listenerIterator;
    },
    addListener:function(listener) {
        if ( this.listeners.indexOf(listener) !== -1 ) { return; }
        this.listeners.push(listener);
        this.listenerIteratorDirty = true;
        if ( this.domLayoutObserver === undefined ) { return; }
        try { listener.onDOMCreated(); }
        catch (ex) { }
        this.startMutationObserver();
    },
    removeListener:function(listener) {
        const pos = this.listeners.indexOf(listener);
        if ( pos === -1 ) { return; }
        this.listeners.splice(pos, 1);
        this.listenerIteratorDirty = true;
        if ( this.listeners.length === 0 ) {
          this.stopMutationObserver();
        }
    },
    cleanup: function() {
      if ( this.domLayoutObserver !== undefined ) {
        this.domLayoutObserver.disconnect();
        this.domLayoutObserver = undefined;
      }
      if ( this.safeObserverHandlerTimer !== undefined ) {
        this.safeObserverHandlerTimer.clear();
        this.safeObserverHandlerTimer = undefined;
      }
    },
    start:function() {
      /*for ( const listener of this.getListenerIterator() ) {
          try { listener.onDOMCreated(); }
          catch (ex) { }
      }*/
      this.startMutationObserver();
    },
    onResponseReady: function(response) {
      if ( response instanceof Object === false ) { return; }
      vAPI.bootstrap = undefined;

      // cosmetic filtering engine aka 'cfe'
      const cfeDetails = response && response.specificCosmeticFilters;
      /*if ( !cfeDetails || !cfeDetails.ready ) {
          vAPI.domWatcher = vAPI.domCollapser = vAPI.domFilterer =
          vAPI.domSurveyor = vAPI.domIsLoaded = null;
          return;
      }*/
      vAPI.domWatcher.start(); // vAPI.domCollapser.start();
      const {
          noSpecificCosmeticFiltering,
          noGenericCosmeticFiltering,
          scriptletDetails,
      } = response;
      /*
      vAPI.noSpecificCosmeticFiltering = noSpecificCosmeticFiltering;
      vAPI.noGenericCosmeticFiltering = noGenericCosmeticFiltering;
      if ( noSpecificCosmeticFiltering && noGenericCosmeticFiltering ) {
        vAPI.domFilterer = null;
        vAPI.domSurveyor = null;
      } else {
        const domFilterer = vAPI.domFilterer = new vAPI.DOMFilterer();
        if ( noGenericCosmeticFiltering || cfeDetails.disableSurveyor ) {
          vAPI.domSurveyor = null;
        }
        domFilterer.exceptions = cfeDetails.exceptionFilters;
        domFilterer.addCSS(cfeDetails.injectedCSS);
        domFilterer.addProceduralSelectors(cfeDetails.proceduralFilters);
        domFilterer.exceptCSSRules(cfeDetails.exceptedFilters);
        domFilterer.convertedProceduralFilters = cfeDetails.convertedProceduralFilters;
        vAPI.userStylesheet.apply();
      }*/

      // Library of resources is located at:
      // https://github.com/gorhill/uBlock/blob/master/assets/ublock/resources.txt
      if ( scriptletDetails && typeof self.uBO_scriptletsInjected !== 'string' ) {
          self.uBO_scriptletsInjected = scriptletDetails.filters;
          if ( scriptletDetails.mainWorld ) {
              //TODO JM vAPI.injectScriptlet(document, scriptletDetails.mainWorld);
              //vAPI.injectedScripts = scriptletDetails.mainWorld;
          }
      }

      if ( vAPI.domSurveyor ) {
          if ( Array.isArray(cfeDetails.genericCosmeticHashes) ) {
              vAPI.domSurveyor.addHashes(cfeDetails.genericCosmeticHashes);
          }
          vAPI.domSurveyor.start(cfeDetails);
      }

      const readyState = document.readyState;
      if ( readyState === 'interactive' || readyState === 'complete' ) {
          return this.onDomReady();
      }
      document.addEventListener('DOMContentLoaded', () => this.onDomReady(), { once: true });
    },
    onDomReady:function(){
      // This can happen on Firefox. For instance:
      // https://github.com/gorhill/uBlock/issues/1893
      if ( window.location === null ) { return; }
      if ( self.vAPI instanceof Object === false ) { return; }
      vAPI.messaging.send('contentscript', {
          what: 'shouldRenderNoscriptTags',
      });
      if ( vAPI.domFilterer instanceof Object ) {
          vAPI.domFilterer.commitNow();
      }
      if ( vAPI.domWatcher instanceof Object ) {
          vAPI.domWatcher.start();
      }
      // Element picker works only in top window for now.
      if (
        window !== window.top ||
        vAPI.domFilterer instanceof Object === false
      ) {
        return;
      }

      // To be used by element picker/zapper.
      vAPI.mouseClick = { x: -1, y: -1 };

      const onMouseClick = function(ev) {
          if ( ev.isTrusted === false ) { return; }
          vAPI.mouseClick.x = ev.clientX;
          vAPI.mouseClick.y = ev.clientY;

          // https://github.com/chrisaljoudi/uBlock/issues/1143
          //   Find a link under the mouse, to try to avoid confusing new tabs
          //   as nuisance popups.
          // https://github.com/uBlockOrigin/uBlock-issues/issues/777
          //   Mind that href may not be a string.
          const elem = ev.target.closest('a[href]');
          if ( elem === null || typeof elem.href !== 'string' ) { return; }
          vAPI.messaging.send('contentscript', {
              what: 'maybeGoodPopup',
              url: elem.href || '',
          });
      };

      document.addEventListener('mousedown', onMouseClick, true);

      // https://github.com/gorhill/uMatrix/issues/144
      vAPI.shutdown.add(function() {
        document.removeEventListener('mousedown', onMouseClick, true);
      });
    }
  }
  /*******************************************************************************
   
  The DOM filterer is the heart of uBO's cosmetic filtering.
  
  DOMFilterer: adds procedural cosmetic filtering
  
  */
 
  vAPI.hideStyle = 'display:none!important;';
  
  vAPI.DOMFilterer = class {
    constructor() {
      this.commitTimer = new vAPI.SafeAnimationFrame(
        ( ) => { this.commitNow(); }
        );
        this.disabled = false;
        this.listeners = [];
        this.stylesheets = [];
        this.exceptedCSSRules = [];
        this.exceptions = [];
        this.convertedProceduralFilters = [];
        this.proceduralFilterer = null;
    }
    
    explodeCSS(css) {
      const out = [];
      const cssHide = `{${vAPI.hideStyle}}`;
      const blocks = css.trim().split(/\n\n+/);
      for ( const block of blocks ) {
        if ( block.endsWith(cssHide) === false ) { continue; }
        out.push(block.slice(0, -cssHide.length).trim());
      }
      return out;
    }
    addCSS(css, details = {}) {
      if ( typeof css !== 'string' || css.length === 0 ) { return; }
      if ( this.stylesheets.includes(css) ) { return; }
      this.stylesheets.push(css);
      if ( details.mustInject && this.disabled === false ) {
        vAPI.userStylesheet.add(css);
      }
      if ( this.hasListeners() === false ) { return; }
      if ( details.silent ) { return; }
      this.triggerListeners({ declarative: this.explodeCSS(css) });
    }
    exceptCSSRules(exceptions) {
      if ( exceptions.length === 0 ) { return; }
      this.exceptedCSSRules.push(...exceptions);
      if ( this.hasListeners() ) {
        this.triggerListeners({ exceptions });
      }
    }   
    addListener(listener) {
      if ( this.listeners.indexOf(listener) !== -1 ) { return; }
      this.listeners.push(listener);
    }   
    removeListener(listener) {
      const pos = this.listeners.indexOf(listener);
      if ( pos === -1 ) { return; }
      this.listeners.splice(pos, 1);
    }
    hasListeners() {
      return this.listeners.length !== 0;
    }
    triggerListeners(changes) {
      for ( const listener of this.listeners ) {
        listener.onFiltersetChanged(changes);
      }
    }   
    toggle(state, callback) {
      if ( state === undefined ) { state = this.disabled; }
      if ( state !== this.disabled ) { return; }
      this.disabled = !state;
      const uss = vAPI.userStylesheet;
      for ( const css of this.stylesheets ) {
        if ( this.disabled ) {
          uss.remove(css);
        } else {
          uss.add(css);
        }
      }
      uss.apply(callback);
    }   
    // Here we will deal with:
    // - Injecting low priority user styles;
    // - Notifying listeners about changed filterset.
    // https://www.reddit.com/r/uBlockOrigin/comments/9jj0y1/no_longer_blocking_ads/
    //   Ensure vAPI is still valid -- it can go away by the time we are
    //   called, since the port could be force-disconnected from the main
    //   process. Another approach would be to have vAPI.SafeAnimationFrame
    //   register a shutdown job: to evaluate. For now I will keep the fix
    //   trivial.
    commitNow() {
      this.commitTimer.clear();
      if ( vAPI instanceof Object === false ) { return; }
      vAPI.userStylesheet.apply();
      if ( this.proceduralFilterer instanceof Object ) {
        this.proceduralFilterer.commitNow();
      }
    }
    commit(commitNow) {
      if ( commitNow ) {
        this.commitTimer.clear();
        this.commitNow();
      } else {
        this.commitTimer.start();
      }
    }
    proceduralFiltererInstance() {
      if ( this.proceduralFilterer instanceof Object === false ) {
        if ( vAPI.DOMProceduralFilterer instanceof Object === false ) {
          return null;
        }
        this.proceduralFilterer = new vAPI.DOMProceduralFilterer(this);
      }
      return this.proceduralFilterer;
    }   
    addProceduralSelectors(selectors) {
      const procedurals = [];
      for ( const raw of selectors ) {
        procedurals.push(JSON.parse(raw));
      }
      if ( procedurals.length === 0 ) { return; }
      const pfilterer = this.proceduralFiltererInstance();
      if ( pfilterer !== null ) {
        pfilterer.addProceduralSelectors(procedurals);
      }
    }
    createProceduralFilter(o) {
      const pfilterer = this.proceduralFiltererInstance();
      if ( pfilterer === null ) { return; }
      return pfilterer.createProceduralFilter(o);
    }  
    getAllSelectors(bits = 0) {
      const out = {
        declarative: [],
        exceptions: this.exceptedCSSRules,
      };
      const hasProcedural = this.proceduralFilterer instanceof Object;
      const includePrivateSelectors = (bits & 0b01) !== 0;
      const masterToken = hasProcedural
      ? `[${this.proceduralFilterer.masterToken}]`
      : undefined;
      for ( const css of this.stylesheets ) {
        for ( const block of this.explodeCSS(css) ) {
          if (
            includePrivateSelectors === false &&
            masterToken !== undefined &&
            block.startsWith(masterToken)
            ) {
              continue;
            }
            out.declarative.push(block);
          }
        }
        const excludeProcedurals = (bits & 0b10) !== 0;
        if ( excludeProcedurals === false ) {
          out.procedural = [];
          if ( hasProcedural ) {
            out.procedural.push(
              ...this.proceduralFilterer.selectors.values()
              );
            }
            const proceduralFilterer = this.proceduralFiltererInstance();
            if ( proceduralFilterer !== null ) {
              for ( const json of this.convertedProceduralFilters ) {
                const pfilter = proceduralFilterer.createProceduralFilter(json);
                pfilter.converted = true;
                out.procedural.push(pfilter);
              }
            }
          }
          return out;
    }      
    getAllExceptionSelectors() {
      return this.exceptions.join(',\n');
    }
  }

  adsMgr.initialize()
}