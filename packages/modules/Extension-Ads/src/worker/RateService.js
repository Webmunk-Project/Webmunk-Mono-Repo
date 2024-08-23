export class RateService {
  constructor() {
    this.lastNotificationTimestamp = null;
    this.initializeLastNotificationTime();
  }

  async initializeLastNotificationTime() {
    this.lastNotificationTimestamp = await this.getLastAdsRateNotificationTime();
  }

  async shouldNotify() {
    const currentTime = Date.now();

    if (this.lastNotificationTimestamp && (currentTime - this.lastNotificationTimestamp) < 1200000) {
      return false;
    }

    this.lastNotificationTimestamp = currentTime;
    await chrome.storage.local.set({ lastAdsRateNotificationTime: currentTime });
    return true;
  }

  async getLastAdsRateNotificationTime() {
    const result = await chrome.storage.local.get('lastAdsRateNotificationTime');
    return result.lastAdsRateNotificationTime || 0;
  }

  async send(tabId) {
    if (!await this.shouldNotify()) return;

    return new Promise((resolve, reject) => {
      const messageListener = (message, sender, sendResponse) => {
        if (message.action === 'CONTENT_SERVICE_RESPONSE_AD_RATING_SUBMITTED') {
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
        { action: 'SERVICE_CONTENT_REQUEST_SHOW_AD_RATING' },
        { frameId: 0 }
      );
    });
  }
}
