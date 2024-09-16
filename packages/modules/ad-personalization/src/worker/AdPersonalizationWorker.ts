import config from '../data/config.json';

interface SendData {
  url: string;
  key: string;
}

interface Message {
  action: string;
  data: SendData;
}

interface MessageResponse {
  response: boolean;
  tabId: number;
}

enum moduleEvents {
  AD_PERSONALIZATION = 'ad_personalization',
};

export class AdPersonalizationWorker {
  private eventEmitter: any;

  constructor() {
    this.eventEmitter = (self as any).messenger.registerModule('ad-personalization');
  }

  initialize() {
    (self as any).messenger.addReceiver('adPersonalization', this);
    chrome.runtime.onMessage.addListener(this.onPopupMessage.bind(this));
    this.initSettings();
  }

  async onPopupMessage(request: Message, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
    if (request.action === 'webmunkExt.popup.checkSettingsReq') {
      const { response, tabId } = await this.send(request.data);
      if (!response) return;
      this.eventEmitter.emit(moduleEvents.AD_PERSONALIZATION, { data: request.data, value: response });

      setTimeout(async () => await chrome.tabs.remove(tabId), 3000);

      const checkedAdPersonalizationResult = await chrome.storage.local.get('adPersonalization.checkedItems');
      const checkedAdPersonalization = checkedAdPersonalizationResult.checkedAdPersonalization || {};

      checkedAdPersonalization[request.data.url] = response;

      await chrome.storage.local.set({ 'adPersonalization.checkedItems': checkedAdPersonalization});
    }
  }

  async initSettings() {
    const adPersonalization = config;
    console.log(`china`, adPersonalization);
    await chrome.storage.local.set({ 'adPersonalization.items': adPersonalization });
  }

  async send(data: SendData): Promise<MessageResponse> {
    const { url, key } = data;

    return new Promise((resolve, reject) => {
      let createdTabId: number | null = null;

      const messageListener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        if (message.action === 'adsPersonalization.strategies.settingsResponse' && sender.tab?.id === createdTabId) {
          chrome.runtime.onMessage.removeListener(messageListener);
          resolve({ response: message.response, tabId: sender.tab.id });
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);

      chrome.tabs.create({ url: url }, (tab) => {
        if (tab && tab.id) {
          createdTabId = tab.id;

          chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
            if (tabId === createdTabId && changeInfo.status === 'complete') {
              chrome.tabs.sendMessage(
                createdTabId,
                { action: 'adsPersonalization.strategies.settingsRequest', key }
              );
            }
          });
        }
      });
    });
  }
}

