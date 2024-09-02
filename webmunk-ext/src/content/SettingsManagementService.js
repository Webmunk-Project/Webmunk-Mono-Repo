export class SettingsManagementService {
  constructor() {
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  handleMessage(message, sender, sendResponse) {
    if (message.action === 'webmunkExt.settingsManagement.amazonSettingsRequest') {
      this.handleUrl(message.url);
    }
  }

  handleUrl(url) {
      if (url === 'https://www.amazon.com/adprefs') {
        this.amazonSettings();
      } else if (url === 'https://accountscenter.facebook.com/ad_preferences/ad_settings/data_from_partners') {
        this.facebookSettings();
      } else if (url === 'https://myadcenter.google.com/personalizationoff') {
        this.googleSettings();
      }
  }

  async amazonSettings() {
    const boxes = document.querySelectorAll('[name="optout"]');
    const trueBox = Array.from(boxes).find((box) => box.value === '0');

    await new Promise((resolve) => requestAnimationFrame(resolve));

    if (trueBox.checked) return this.sendResponseToService(true);

    trueBox.click();

    const saveButton = document.getElementById('optOutControl');
    saveButton.click();

    this.sendResponseToService(true);
  }

  async googleSettings() {
    const offButton = document.querySelector('[aria-label="Turn off"]');
    if(offButton) return this.sendResponseToService(true);

    const onButton = document.querySelector('[aria-label="Turn on"]');
    onButton.click();

    const saveButton = document.querySelector('[jsname="Lnwj0b"]');
    saveButton.click();

    this.sendResponseToService(true);
  }

  async facebookSettings() {
    const reviewButton = await this.waitForElement('.x1lliihq.x193iq5w.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft');
    reviewButton.click();

    const trueBox = await this.waitForElement('[name="radio1"]');

    if (trueBox.checked) return this.sendResponseToService(true);

    await new Promise(resolve => requestAnimationFrame(resolve));
    trueBox.click();

    const buttons = document.querySelectorAll('.x1lliihq.x193iq5w.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft');
    const confirmButton = buttons[buttons.length - 1];
    confirmButton.click();

    this.sendResponseToService(true);
  }

  waitForElement(selector, textContent = null) {
    return new Promise((resolve) => {
      const check = () => {
        const elements = Array.from(document.querySelectorAll(selector));
        const element = textContent ? elements.find((el) => el.textContent.trim() === textContent) : elements[0];

        if (element && element.offsetParent !== null) {
            resolve(element);
        } else {
            requestAnimationFrame(check);
        }
      };

      check();
    });
  }

  sendResponseToService(response) {
    chrome.runtime.sendMessage({
      action: 'webmunkExt.settingsManagement.amazonSettingsResponse',
      response
    });
  }
}