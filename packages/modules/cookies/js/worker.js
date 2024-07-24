const cookiesAppMgr = {
  initialize: async function() {
    self.messenger?.addReceiver('cookiesAppMgr', this);
    console.log('[Cookies] Initialized.');
  },

  _onMessage_checkPrivacy() {
    const privacySandbox = {
      topicsEnabled: false,
      fledgeEnabled: false,
      adMeasurementEnabled: false,
    };

    if (chrome.privacy && chrome.privacy.websites) {
      chrome.privacy.websites.thirdPartyCookiesAllowed.get({}, function(result) {
        console.log(`thirdPartyCookiesAllowed: ${result.value}`);
      })

      const topicsPromise = new Promise((resolve) => {
        chrome.privacy.websites.topicsEnabled.get({}, (result) => {
          privacySandbox.topicsEnabled = result.value;
          resolve();
        });
      });

      const fledgePromise = new Promise((resolve) => {
        chrome.privacy.websites.fledgeEnabled.get({}, (result) => {
          privacySandbox.fledgeEnabled = result.value;
          resolve();
        });
      });

      const adMeasurementPromise = new Promise((resolve) => {
        chrome.privacy.websites.adMeasurementEnabled.get({}, (result) => {
          privacySandbox.adMeasurementEnabled = result.value;
          resolve();
        });
      });

      Promise.all([topicsPromise, fledgePromise, adMeasurementPromise]).then(() => {
        console.log(`Privacy sandbox: ${JSON.stringify(privacySandbox, null, 2)}`);
      });
    }
  },

  _onMessage_recordCookies(data) {
    const { pageTitle, url } = data;
    console.log('[Cookie] Recording cookies for ' + url + '...');

    const payload = {
      'url*': url,
      'page-title*': pageTitle,
      cookies: [],
    };

    chrome.cookies.getAll({ url: url }, (cookies) => {
      cookies.forEach((cookie) => {
        console.log(cookie.name + ' --> ' + cookie.name);
        console.log(cookie);

        payload.cookies.push(cookie);
      });

        // Uncomment and adjust if needed
        // if (payload.cookies.length > 0) {
        //   const newRequest = {
        //     content: 'record_data_point',
        //     generator: 'browser-cookies',
        //     payload: payload // eslint-disable-line object-shorthand
        //   };
        //
        //   // handleMessage(newRequest, sender, sendResponse);
        // }
      });
  }
};

cookiesAppMgr.initialize();
export { cookiesAppMgr };
