export class SettingsManagementService {
  constructor() {}

  async loadSettingsManagement() {
    const response = await fetch('../data/settings-management.json');
    const data = await response.json();

    return data;
  }

  async send(url) {
    return new Promise((resolve, reject) => {
      let createdTabId = null;

      const messageListener = (message, sender, sendResponse) => {
        if (message.action === 'webmunkExt.settingsManagement.amazonSettingsResponse' && sender.tab.id === createdTabId) {
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
              { action: 'webmunkExt.settingsManagement.amazonSettingsRequest', url }
            );
          }
        });
      });
    });
  }
}
