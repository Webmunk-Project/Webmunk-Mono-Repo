import PostMessageMgr from './postMessage' 


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
    initialize:async function(){
      if(isFrame()){
        //console.log("Url of iframe="+document.URL)
        this.postMessageMgr = new PostMessageMgr();
      } 
      else{
        this.postMessageMgr = new PostMessageMgr();
        this.postMessageMgr.setReceiver((data)=>this.mainReceivePostMessage(data))
      }
      this.iframeSourceObserver = new MutationObserver(this.iframeSourceModified);
    
      //vAPI.domMutationTime = Date.now();
      vAPI.domWatcher = { start: ()=>this.start(), addListener: () => addListener(), removeListener: ()=>removeListener() };
      /*chrome.runtime.sendMessage({action:'appMgr.retrieveContentScriptParameters',
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
    mainReceivePostMessage:function(data){
      switch(data.action){
        case 'ready':
          console.log(`[${window.name} iframe ready `+data.data)
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
      return chrome.runtime.sendMessage({action:"appMgr.captureRegion", data:{region:rect}}).then( data => {
        console.log("captureToCanvas ",data)
      })
    },
    hasAnAdsParent:function(node){
      const MAX_LEVEL = 4;
      let i = 0;
      while (i< MAX_LEVEL && node.parentElement != null){
        i++;
        node = node.parentElement;
        if (node.ads) return true;
      }
      return false;
    },
    highlightNodeAsAds(node, indent, selector, color){
      console.log(`Node matched the selector: ${selector} ${document.URL} ${indent}`,node);
      node.style.border=`dashed 1px ${color}`
      if (node.style.display != "none") node.style.display="inline-block"
      node.style.margin="2px"
      node.ads = true;
    },
    traverseDOM:async function(node, indent = 0) {    
      if ( node.nodeType !== 1 ) return
      if ( this.ignoreTags.has(node.localName) ) return
      if ((node.href && typeof node.href != "object") || node.src){ 
        if (node.src) console.log(`${node.localName} Node has src `+node.src)
        if (node.href) console.log(`${node.localName} Node has href `+node.href)
        let urlIsAnAd = await chrome.runtime.sendMessage({action:"appMgr.isUrlAnAds",data:{src: node.src, href: node.href}}).then(result=>{
          return result.data.urlIsAnAd;
        })
        if (urlIsAnAd){
          this.highlightNodeAsAds(node, indent, "urlIsAnAd","red");
          this.notifyForAd(node);
        }
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        this.cssSelectors.forEach(async (selector) => {
          if (node.localName=="iframe") {
            this.iframeSourceObserver.observe(node, this.iframeSourceObserverOptions);}
          if (node.matches(selector) && !this.hasAnAdsParent(node)) {
            this.highlightNodeAsAds(node, indent, selector, "blue");
            //this.captureToCanvas(node.parentElement)
            this.notifyForAd(node);
          }
        });
        if (!node.ads) for (let i = 0; i < node.childNodes.length; i++) {
          this.traverseDOM(node.childNodes[i], indent + 2);
        }
      }
    },
    notifyForAd(node){
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
      chrome.runtime.sendMessage({action:"appMgr.adDetected",data:{
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
          console.log("FrameId data:",node,data)
          node.setAttribute("frameId",data)
          node.frameId = data;
        })
      }
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
              if (node.contentWindow && !node.src){
                this.getFrameId(node)
              }
              else node.onload = () => {
                try{
                  console.log("iframe onload",node.contentWindow.document)
                }
                catch(e){}
                this.getFrameId(node)
              }
              //await this.waitForContentWindow(node);

            }
            if (isFrame()){
              this.traverseDOM(node, 0);
            }
            else{
              console.log("Launching traverseDOM from top "+node.id)
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
      console.log("startMutationObserver..."+document.URL)
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