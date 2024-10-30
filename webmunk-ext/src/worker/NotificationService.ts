export class NotificationService {
  constructor() {}

  public async showNotification(tabId: number, text: string): Promise<void> {
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