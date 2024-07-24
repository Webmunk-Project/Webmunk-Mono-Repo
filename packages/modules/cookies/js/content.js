/* global chrome, locationFilterMatches */

(function () {
  function recordCookies() {
    const url = window.location.href;
    const pageTitle = document.title
    // if (locationFilterMatches(window.location, config['cookie-filters'])) {
    if (!url || url === 'about:blank') {
      return;
    }

    console.log('[Cookies] Recording cookies from ' + window.location + '...');
    chrome.runtime.sendMessage({
      action: 'cookiesAppMgr.recordCookies',
      data: { pageTitle, url } }
    );
    // } else {
    //   console.log('[Cookies] Skipping ' + window.location + '.')
    // }
  }

  window.addEventListener('load', recordCookies);
})(); // eslint-disable-line semi, no-trailing-spaces
