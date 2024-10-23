interface SurveyItem {
  name: string;
  url: string;
}

export class SurveyChecker {
  private duration: number;
  private lastRemoveModalTimestamp: number = 0;

  constructor(duration: number) {
    this.duration = duration * 60 * 60 * 1000;
    this.initializeLastRemoveModalTimestamp();
  }

  private async initializeLastRemoveModalTimestamp(): Promise<void> {
    this.lastRemoveModalTimestamp = (await this.getLastRemoveModalTimestamp()) || Date.now();
  }

  private async getLastRemoveModalTimestamp(): Promise<number | null> {
    const result = await chrome.storage.local.get('lastRemoveModalTimestamp');

    return result.lastRemoveModalTimestamp || 0;
  }

  public async isQualtricsSurveyCompleted(): Promise<boolean> {
    const storage = await chrome.storage.local.get('completedSurveys');
    const response: SurveyItem[] = storage.completedSurveys || [];

    const hasQualtrics = response.some((survey) => survey.name.includes('Qualtrics'));

    return hasQualtrics;
  }

  private async isNeedToShowRemoveModal(): Promise<boolean> {
    const currentTime = Date.now();

    return currentTime - this.lastRemoveModalTimestamp > this.duration;
  }

  private async getTabId(): Promise<number> {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];

        if (tab && tab.id !== undefined) resolve(tab.id);
      });
    });
  }

  public async send(): Promise<void> {
    if (await this.isQualtricsSurveyCompleted()) return;
    if (!await this.isNeedToShowRemoveModal()) return;

    this.lastRemoveModalTimestamp = Date.now();
    chrome.storage.local.set({ lastAdsRateNotificationTime: this.lastRemoveModalTimestamp });

    const tabId = await this.getTabId();

    return new Promise((resolve, reject) => {
      const messageListener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        if (message.action === 'webmunkExt.surveyChecker.removeModalResponse') {
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
        { action: 'webmunkExt.surveyChecker.removeModalRequest' },
        { frameId: 0 }
      );
    });
  }
}