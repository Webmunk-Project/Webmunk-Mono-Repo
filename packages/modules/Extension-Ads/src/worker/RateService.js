export class RateService {
  constructor() {
    this.lastNotificationTimestamp = null;
    this.initializeLastNotificationTime();
  }

  async initializeLastNotificationTime() {
    // We use Date.now() to ensure the first 20 minutes pass after the user loads the extension before applying the logic of getLastAdsRateNotificationTime().
    this.lastNotificationTimestamp = (await this.getLastAdsRateNotificationTime()) || Date.now();
  }

  async shouldNotify() {
    const currentTime = Date.now();

    // 20 min
    return currentTime - this.lastNotificationTimestamp >= 1200000;
  }

  async getLastAdsRateNotificationTime() {
    const result = await chrome.storage.local.get('lastAdsRateNotificationTime');
    return result.lastAdsRateNotificationTime || 0;
  }

  async send(tabId) {
    if (!await this.shouldNotify()) return;

    this.lastNotificationTimestamp = Date.now();
    chrome.storage.local.set({ lastAdsRateNotificationTime: this.lastNotificationTimestamp });

    return new Promise((resolve, reject) => {
      const messageListener = (message, sender, sendResponse) => {
        if (message.action === 'extensionAds.rateService.adRatingResponse') {
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

      chrome.tabs.sendMessage(
        tabId,
        { action: 'extensionAds.rateService.adRatingRequest' },
        { frameId: 0 }
      );
    });
  }
}
