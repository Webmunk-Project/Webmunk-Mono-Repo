export class RateService {
  constructor() {
    this.lastNotificationTimestamp = null;
    this.initialTimestamp = null;
    this.initializeNotificationTimes();
  }

  async initializeNotificationTimes() {
    this.lastNotificationTimestamp = await this.getLastAdsRateNotificationTime();
    this.initialTimestamp = await this.getInitialNotificationTime();
  }

  async shouldNotify() {
    const currentTime = Date.now();

    if (!this.lastNotificationTimestamp && (currentTime - this.initialTimestamp) < 1200000) {
      return false;
    }

    if (this.lastNotificationTimestamp && (currentTime - this.lastNotificationTimestamp) < 1200000) {
      return false;
    }

    return true;
  }

  async getLastAdsRateNotificationTime() {
    const result = await chrome.storage.local.get('lastAdsRateNotificationTime');
    return result.lastAdsRateNotificationTime || 0;
  }

  async getInitialNotificationTime() {
    const result = await chrome.storage.local.get('initialAdsRateNotificationTime');

    if (result.initialAdsRateNotificationTime) return result.initialAdsRateNotificationTime;

    const currentTime = Date.now();
    await chrome.storage.local.set({ initialAdsRateNotificationTime: currentTime });

    return currentTime;
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
