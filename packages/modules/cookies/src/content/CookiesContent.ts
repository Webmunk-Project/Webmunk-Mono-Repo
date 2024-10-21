export class CookiesContent {
  constructor() {
    window.addEventListener('load', () => this.initialize());
  }

  public initialize(): void {
    const url = window.location.href;

    if (!url || url === 'about:blank') {
      return;
    }

    chrome.runtime.sendMessage({
      action: 'cookies.recordCookies',
      data: {
        pageTitle: document.title,
        url: url
      }
    });
  }
}