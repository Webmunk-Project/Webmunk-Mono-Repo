export class RateService {
  constructor() {
    this.lastNotificationTimestamp = null;
    this.initializeLastNotificationTime();
  }

  async initializeLastNotificationTime() {
    this.lastNotificationTimestamp = await this.getLastNotificationTime();
  }

  async shouldNotify() {
    const currentTime = new Date().getTime();

    if (this.lastNotificationTimestamp && (currentTime - this.lastNotificationTimestamp) < 1200000) {
      return false;
    }

    this.lastNotificationTimestamp = currentTime;
    await chrome.storage.local.set({ lastNotificationTime: currentTime });
    return true;
  }

  async getLastNotificationTime() {
    const result = await chrome.storage.local.get('lastNotificationTime');
    return result.lastNotificationTime || 0;
  }

  async send(tabId) {
    if (!await this.shouldNotify()) return;

    await chrome.tabs.sendMessage(
      tabId,
      { action: 'SHOW_NOTIFICATION' },
      { frameId: 0 }
    );

    return new Promise((resolve, reject) => {
      const messageListener = (message, sender, sendResponse) => {
        if (message.action === 'AD_RATING_RESPONSE') {
          chrome.runtime.onMessage.removeListener(messageListener);
          chrome.tabs.onRemoved.removeListener(tabCloseListener);
          resolve(message.response);
        }
      };

      const tabCloseListener = (closedTabId, removeInfo) => {
        if (closedTabId === tabId) {
          chrome.runtime.onMessage.removeListener(messageListener);
          reject(null);
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);
      chrome.tabs.onRemoved.addListener(tabCloseListener);
    });
  }
}
