const cookieAppMgr = {
  initialize: async function() {
    self.messenger?.addReceiver('cookieAppMgr', this);

    this.registerMessageHandler();
  },
  recordCookies(request, sender, sendResponse) {
    console.log('[Cookie] Recording cookies for ' + request.url + '...');

    if (request.content === 'record_cookies') {
      const payload = {
        'url*': request.url,
        'page-title*': request.pageTitle,
        cookies: [],
      };

      chrome.cookies.getAll({ url: request.url }, (cookies) => {
        cookies.forEach((cookie) => {
          console.log(cookie.name + ' --> ' + cookie.name);
          console.log(cookie);

          payload.cookies.push(cookie);
        });

        // if (payload.cookies.length > 0) {
        //   const newRequest = {
        //     content: 'record_data_point',
        //     generator: 'browser-cookies',
        //     payload: payload // eslint-disable-line object-shorthand
        //   };

        //   // handleMessage(newRequest, sender, sendResponse);
        // }
      });

      return true;
    }

    return false;
  },

  registerMessageHandler() {
    console.log('[Cookies] Initialized.');

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.content === 'record_cookies') {
        this.recordCookies(request, sender, sendResponse);
      }
    });
  }
}

cookieAppMgr.initialize();
export {cookieAppMgr}
