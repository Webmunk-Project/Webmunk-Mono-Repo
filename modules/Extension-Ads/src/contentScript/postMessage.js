const isFrame = () => window!==window.top

export default class PostMessageMgr {
  constructor() {
    this._promises = new Map()
    this._promiseIdToContentWindow = new Map();
    this._receiveHdlr = (_data) => {
      return Promise.resolve({success: false, msg:"no receive handler set for "+this.from});
    }
    this.addMessageHdlr()
    if(!isFrame()){
      this.from = 0;
      this.frameMap =  new Map()
      this.idToFrame = new Map();
      // create a test iframe
      /*setTimeout(()=>{
        let iframe = document.createElement("iframe")
        iframe.id = "webmunkFakeId"
        document.body.appendChild(iframe)
      },10000)*/
    }
    else {
      chrome.runtime.sendMessage({action:"Messenger.getFrameId"}).then((frameId) => {
        window.frameId = frameId;
        this.sendTo(window.top,"registerFrame", {frameId}).then(reply => {
          console.log("PostMessageMgr: frameId="+reply.frameId)
        });
      });
      window.addEventListener('beforeunload', function (event) {
        // Your logic here
        console.log(`[${window.name}] Window is about to be reloaded or unloaded.`);
     });
    }
  }
  setReceiver(receiverHldr) {
    this._receiveHdlr = receiverHldr
  }
  
  addMessageHdlr() {
    let name="";
    if (isFrame()){
      name = "webmunk"+Math.ceil(Math.random()*1000)
      /*setInterval(()=>{
        console.log("I'm alive "+name)
      },3000)*/
      console.log(`[${name}] addMessageHdlr ready for `+document.URL,document)
      this.sendTo(window.top,"ready",name)
    } 
    else{ 
      name = "webmunkMain"
    }
    //window.name = name;
    window.addEventListener('message', async(event) => {
      if (!event.data.action) return // this is not an app message 
      let eventData = event.data;
      //console.log(`[${window.name}]: addMessageHdlr Receiving  `+event.data.action+" "+event?.data?.data?.frameCorrelationId)

      switch(eventData.direction){
        case "FORWARD":
          if (eventData.action == "getFrameId"){
            let frameId = await chrome.runtime.sendMessage({action:"Messenger.getFrameId"});
            console.log(`[${window.name}-${eventData.requestId}]:  replying ${frameId} `+event.data.action)
            return this.reply(eventData.action, event.source, frameId, eventData.promiseId, eventData.requestId)
          }
          if (eventData.action == "registerFrame"){

            if (!event.source){
              console.log("addMessageHdlr: event source is null for "+event.origin)
              return;
            }
            let iframeElts = document.getElementsByTagName('iframe');
            /*Array.from(iframeElts).forEach(f => {
              console.log("Iframe content window:",f.contentWindow)
            })*/
            let registered = false;
            for (var i = 0; i < iframeElts.length; i++) {
              if (iframeElts[i].contentWindow === event.source) {
                iframeElts[i].setAttribute("frameid",eventData.data.frameId)
                registered = true;
                break;
              }
            };
            return this.reply(eventData.action, event.source, {success:true, frameId:eventData.data.frameId}, eventData.promiseId)
          }
          let result = await this._receiveHdlr(eventData);
          this.reply(eventData.action, event.source, result, eventData.promiseId)
          break;
        case "BACK":
          //console.log('postMessageMgr.addMessageHdlr: Receiving msg from postmessage',eventData)
          var _promiseId = event.data.promiseId
          var _p = this._promises.get(_promiseId)
          if (_p) {
            _p.resolve(event.data.data)
            console.log(`[${window.name}-${eventData.requestId}]:  Receiving  ${event.data.data}`)

            this._promises.delete(_promiseId)
          }
          break;
      }
    }/*,{capture:true}*/)
  }
  send(action, to, data) {
    let w = isFrame() ? window.parent : this._promiseIdToContentWindow.get(to).contentWindow;
    var _p = new Promise((resolve, reject) => {
      var _promiseId = new Date().getTime()
      this._promises.set(_promiseId, { resolve, reject })
      w.postMessage(
        {
          to,
          from: this.from,
          promiseId: _promiseId,
          direction: 'FORWARD',
          action,
          data
        },
        '*'
        )
      })
      return _p
    }
    sendTo(w, action, data){
      let requestId = Math.ceil(Math.random()*10000);
      var _p = new Promise((resolve, reject) => {
        var _promiseId = new Date().getTime()
        this._promises.set(_promiseId, { resolve, reject })
        this._promiseIdToContentWindow.set(_promiseId,w)
        try{
          console.log(`[${window.name}]: Sending `+action+" "+requestId+` to [${w.name}]` )
        }
        catch(e){
          console.log(`[${window.name}]: Sending `+action+" "+requestId+` to [UNKNOWN]` )
        }
        w.postMessage(
          {
            requestId,
            promiseId: _promiseId,
            direction: 'FORWARD',
            action,
            data
        },
        '*'
      )
    })
    return _p
  }
  reply(action, to, result, promiseId, requestId) {
    try {
      let w = isFrame() ? window.top : to;
      w.postMessage(
        {
          from: this.from,
          action,
          promiseId,
          requestId,
          direction: 'BACK',
          data: result
        },
        '*'
      )
    }
    catch(e){
      console.log(`EXCEPTION reply to:${to}`,e)
    }
  }
}
