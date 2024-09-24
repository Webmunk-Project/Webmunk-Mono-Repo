import config from '../data/config.json';

interface Message {
  action: string;
  key: string;
}

interface MessageResponse {
  response: {
    value: boolean;
    error?: string;
  };
  tabId: number;
}

enum moduleEvents {
  AD_PERSONALIZATION = 'ad_personalization',
}

export class AdPersonalizationWorker {
  private eventEmitter: any;
  private urlIndexes: { [key: string]: number } = {};

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
      const url = await this.getAccordantUrl(request.key);
      const { response, tabId } = await this.send(request.key, url);

      if (response.error) {
        await chrome.tabs.remove(tabId);
        const nextUrl = await this.getAccordantUrl(request.key, true);
        await this.send(request.key, nextUrl);
        return;
      }

      await this.addWorkingUrl(request.key, url);

      this.eventEmitter.emit(moduleEvents.AD_PERSONALIZATION, { key: request.key, url, value: response.value });

      setTimeout(async () => await chrome.tabs.remove(tabId), 3000);

      const checkedAdPersonalizationResult = await chrome.storage.local.get('adPersonalization.checkedItems');
      const checkedAdPersonalization = checkedAdPersonalizationResult['adPersonalization.checkedItems'] || {};

      checkedAdPersonalization[request.key] = response;

      await chrome.storage.local.set({ 'adPersonalization.checkedItems': checkedAdPersonalization });
    }
  }

  async initSettings() {
    const adPersonalization = config;
    await chrome.storage.local.set({ 'adPersonalization.items': adPersonalization });
  }

  async getAccordantUrl(key: string, isNeedToUseNextUrl: boolean = false): Promise<string> {
    const selectedObject = config.find((object) => object.key === key)!;

    const storageData = await chrome.storage.local.get('adPersonalization.workingUrls');
    const workingUrls = storageData['adPersonalization.workingUrls'] || {};

    if (workingUrls[key] && workingUrls[key].length > 0) {
      return workingUrls[key][0];
    }

    let currentIndex = this.urlIndexes[key] || 0;

    if (isNeedToUseNextUrl) {
      currentIndex = (currentIndex + 1) % selectedObject.url.length;
    }

    this.urlIndexes[key] = currentIndex;

    return selectedObject.url[currentIndex];
  }

  private async addWorkingUrl(key: string, url: string) {
    const storageData = await chrome.storage.local.get('adPersonalization.workingUrls');
    const workingUrls = storageData['adPersonalization.workingUrls'] || {};

    if (!workingUrls[key]) {
      workingUrls[key] = [];
    }

    if (!workingUrls[key].includes(url)) {
      workingUrls[key].unshift(url);
    }

    await chrome.storage.local.set({ 'adPersonalization.workingUrls': workingUrls });
  }
  async send(key: string, url: string): Promise<MessageResponse> {
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