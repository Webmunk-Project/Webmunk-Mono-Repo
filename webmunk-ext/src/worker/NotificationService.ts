export class NotificationService {
  constructor() {}

  public async getTabId(): Promise<number> {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];

        if (tab && tab.id !== undefined) resolve(tab.id);
      });
    });
  }

  public async showNotification(text: string): Promise<void> {
    const tabId = await this.getTabId();

    return new Promise((resolve, reject) => {
      const messageListener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        if (message.action === 'webmunkExt.notificationService.extensionNotificationResponse') {
          chrome.runtime.onMessage.removeListener(messageListener);
          chrome.tabs.onRemoved.removeListener(tabCloseListener);
        }
      };

      const tabCloseListener = (closedTabId: number, removeInfo: chrome.tabs.TabRemoveInfo) => {
        if (closedTabId === tabId) {
          chrome.runtime.onMessage.removeListener(messageListener);
          reject(null);
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);
      chrome.tabs.onRemoved.addListener(tabCloseListener);

      chrome.tabs.sendMessage(
        tabId,
        { action: 'webmunkExt.notificationService.extensionNotificationRequest', text },
        { frameId: 0 }
      );
    });
  }
}