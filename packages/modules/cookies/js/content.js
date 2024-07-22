/* global chrome, locationFilterMatches */

(function () {
  function recordCookies() {
     const url = window.location.href;
    // if (locationFilterMatches(window.location, config['cookie-filters'])) {
      if (url === 'about:blank' || !url || url === '') {
        return;
      }

    console.log('[Cookies] Recording cookies from ' + window.location + '...');
    chrome.runtime.sendMessage({
      action: 'record_cookies',
      content: 'record_cookies',
      url: window.location.href,
      pageTitle: document.title
    });
    // } else {
    //   console.log('[Cookies] Skipping ' + window.location + '.')
    // }
  }

  window.addEventListener('load', recordCookies);
})(); // eslint-disable-line semi, no-trailing-spaces
