const moduleEvents = Object.freeze({
  AD_PERSONALIZATION: 'ad_personalization',
});

export class AdPersonalization {
  constructor() {
    this.eventEmitter = self.messenger.registerModule('ad-personalization');
  }

  initialize() {
    self.messenger.addReceiver('adPersonalization', this);
    chrome.runtime.onMessage.addListener(this.onPopupMessage.bind(this));
    this.initSettings();
  }

  async loadSettingsManagement() {
    const response = await fetch('../data/ad-personalization.json');
    const data = await response.json();

    return data;
  }

  async onPopupMessage(request, sender, sendResponse) {
    if (request.action === 'webmunkExt.popup.settingsClicked') {
      const { response, tabId } = await this.send(request.data);
      if (!response) return;
      this.eventEmitter.emit(moduleEvents.AD_PERSONALIZATION, { url: request.data.url, toggle: response });

      await chrome.tabs.remove(tabId);

      const checkedSettingsResult = await chrome.storage.local.get('checkedSettings');
      const checkedSettings = checkedSettingsResult.checkedSettings || {};

      checkedSettings[request.data.url] = response;

      await chrome.storage.local.set({ checkedSettings });
    }
  }

  async initSettings() {
    const result = await this.loadSettingsManagement();
    await chrome.storage.local.set({ settings: result });
  }

  async send(data) {
    const { url, key } = data;

    return new Promise((resolve, reject) => {
      let createdTabId = null;

      const messageListener = (message, sender, sendResponse) => {
        if (message.action === 'webmunkExt.adPersonalization.settingsResponse' && sender.tab.id === createdTabId) {
          chrome.runtime.onMessage.removeListener(messageListener);
          resolve({ response: message.response, tabId: sender.tab.id });
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);

      chrome.tabs.create({ url: url }, (tab) => {
        createdTabId = tab.id;

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
          if (tabId === createdTabId && changeInfo.status === 'complete') {
            chrome.tabs.sendMessage(
              createdTabId,
              { action: 'webmunkExt.adPersonalization.settingsRequest', key }
            );
          }
        });
      });
    });
  }
}

const adPersonalization = new AdPersonalization();
adPersonalization.initialize();