import { v4 as uuidv4 } from 'uuid';

const WmSessionMgr = {
  sessions: new Map(),
  initialize:function(){
    chrome.storage.local.get('sessions',[]).then(sessions => {
      sessions.forEach(s => {
        this.sessions.set(s.tabId,s.id)
      });
    })
    this.addEventListeners();
  },
  addEventListeners:function(){
    chrome.tabs.onCreated.addListener((tab) => {
      let sessionId = saveSessionData(tab);    
      console.log(`Session created for tab: ${tab.id} with session ID: ${sessionId}`);
    });
  },
  saveSession(tabId){
    let id = uuidv4(); 
    this.sessions.set(tabId,{id})
    chrome.storage.local.set({ 'sessions': Array.from(this.sessions) });
    return id;
  },
  getSession(tabId){
    return this.sessions.get(tabId);
  }
}
WmSessionMgr.initialize();

export default WmSessionMgr;