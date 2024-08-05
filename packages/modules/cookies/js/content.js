window.addEventListener('load', () => {
  const url = window.location.href;
  const pageTitle = document.title

  if (!url || url === 'about:blank') {
    return;
  }

  console.log('[Cookies] Recording cookies from ' + window.location + '...');

  chrome.runtime.sendMessage({
    action: 'cookiesAppMgr.recordCookies',
    data: { pageTitle, url } }
  );
});
