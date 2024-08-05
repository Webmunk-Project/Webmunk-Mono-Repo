const moduleEvents = Object.freeze({
  COOKIES: 'cookies',
  PRIVACY_SETTINGS: 'privacy_settings',
});

const cookiesAppMgr = {
  eventEmitter: self.messenger.registerModule('cookies-scraper'),
  initialize() {
    self.messenger.addReceiver('cookiesAppMgr', this);
  },
  async _onMessage_checkPrivacy() {
    const privacySettings = {
      thirdPartyCookiesAllowed: (await chrome.privacy.websites.thirdPartyCookiesAllowed.get({})).value,
      topicsEnabled: (await chrome.privacy.websites.topicsEnabled.get({})).value,
      fledgeEnabled: (await chrome.privacy.websites.fledgeEnabled.get({})).value,
      adMeasurementEnabled: (await chrome.privacy.websites.adMeasurementEnabled.get({})).value,
    };

    this.eventEmitter.emit(moduleEvents.PRIVACY_SETTINGS, privacySettings);
  },
  async _onMessage_recordCookies(data) {
    const { url, pageTitle } = data;
    const cookies = await chrome.cookies.getAll({ url: url });

    if (!cookies.length) return;

    this.eventEmitter.emit(moduleEvents.COOKIES, { url, pageTitle, cookies });
  }
};

cookiesAppMgr.initialize();

export { cookiesAppMgr, moduleEvents as events };
