enum moduleEvents {
  COOKIES = 'cookies',
  PRIVACY_SETTINGS = 'privacy_settings',
};

interface RequestData {
  url: string;
  pageTitle: string;
}

export class CookiesWorker {
  private eventEmitter: any;

  constructor () {
    this.eventEmitter = (self as any).messenger.registerModule('cookies-scraper');
    chrome.runtime.onMessage.addListener(this.onPopupMessage.bind(this));
  }

  private async onPopupMessage(request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
    if (request.action === 'webmunkExt.popup.successRegister') {
      await this.checkPrivacy();
    } else if (request.action === 'cookies.recordCookies') {
      await this.recordCookies(request.data);
    }
  }

  initialize() {
    (self as any).messenger.addReceiver('cookiesAppMgr', this);
  }

  public async checkPrivacy(): Promise<void> {
    const websites = chrome.privacy.websites as any;

    const privacySettings = {
      thirdPartyCookiesAllowed: (await websites.thirdPartyCookiesAllowed.get({})).value,
      topicsEnabled: (await websites.topicsEnabled.get({})).value,
      fledgeEnabled: (await websites.fledgeEnabled.get({})).value,
      adMeasurementEnabled: (await websites.adMeasurementEnabled.get({})).value,
    };

    this.eventEmitter.emit(moduleEvents.PRIVACY_SETTINGS, privacySettings);
  }

  public async recordCookies(data: RequestData): Promise<void> {
    const { url, pageTitle } = data;
    const cookies = await chrome.cookies.getAll({ url: url });

    if (!cookies.length) return;

    this.eventEmitter.emit(moduleEvents.COOKIES, { url, pageTitle, cookies });
  }
};