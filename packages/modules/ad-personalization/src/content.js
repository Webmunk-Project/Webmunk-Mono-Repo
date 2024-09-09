export class AdPersonalization {
  constructor() {}

  initialize() {
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  handleMessage(message, sender, sendResponse) {
    if (message.action === 'webmunkExt.adPersonalization.settingsRequest') {
      this.handleKey(message.key);
    }
  }

  handleKey(key) {
    switch (key) {
      case 'amazonAdPrefs':
        this.amazonSettings();
        break;
      case 'facebookActivityData':
        this.facebookActivityInformationSettings();
        break;
      case 'googleYouTubeAds':
        this.googleSettings();
        break;
      case 'facebookAudienceAds':
        this.facebookAudienceSettings();
        break;
      case 'facebookCategories':
        this.facebookCategories();
        break;
    }
  }

  addBlurEffect() {
    document.body.style.filter = 'blur(20px)';

    const overlay = document.createElement('div');
    const mainContainer = document.createElement('div');
    const styles = document.createElement('style');
    styles.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');

      .overlay {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 10000;

        width: 100%;
        height: 100%;
      }

      .main-container {
        position: fixed;
        top: 50%;
        left: 50%;
        z-index: 10001;

        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: center;
        justify-content: center;

        color: black;
        font-family: 'Roboto', sans-serif;
        border-radius: 5px;
        background-color: white;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        transform: translate(-50%, -50%);
      }
    `;

    overlay.appendChild(styles);
    overlay.appendChild(mainContainer);

    overlay.classList.add('overlay');
    mainContainer.classList.add('main-container');

    const content = `
      <svg xmlns="http://www.w3.org/2000/svg" style="margin-top: 24px;" width="80px" height="80px" viewBox="0 0 24 24"><g><circle cx="12" cy="2.5" r="1.5" fill="black" opacity="0.6"/><circle cx="16.75" cy="3.77" r="1.5" fill="black" opacity="0.29"/><circle cx="20.23" cy="7.25" r="1.5" fill="black" opacity="0.43"/><circle cx="21.5" cy="12" r="1.5" fill="black" opacity="0.57"/><circle cx="20.23" cy="16.75" r="1.5" fill="black" opacity="0.71"/><circle cx="16.75" cy="20.23" r="1.5" fill="black" opacity="0.86"/><circle cx="12" cy="21.5" r="1.5" fill="black"/><animateTransform attributeName="transform" calcMode="discrete" dur="1.125s" repeatCount="indefinite" type="rotate" values="0 12 12;30 12 12;60 12 12;90 12 12;120 12 12;150 12 12;180 12 12;210 12 12;240 12 12;270 12 12;300 12 12;330 12 12;360 12 12"/></g>
      </svg>
      <p style="font-size: 24px; line-height: 1; margin: 24px; text-align: center;">
        Don't close this tab/window. <br>
        Setting up ad personalization is in progress...
      </p>
    `;
    mainContainer.innerHTML = content;

    document.documentElement.appendChild(overlay);
  }

  async facebookCategories() {
    const checkbox = await this.waitForElements('input[type="checkbox"]');
    this.addBlurEffect();

    checkbox.forEach((box) => {
      if(box.ariaChecked === 'false') return;
      box.click();
    });

    this.sendResponseToService(true);
  }

  async amazonSettings() {
    const signInButton = document.querySelector('#a-autoid-0-announce');
    if (signInButton) {
      signInButton.click();

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const boxes = await this.waitForElements('[name="optout"]');
    this.addBlurEffect();
    const trueBox = Array.from(boxes).find((box) => box.value === '0');

    await new Promise((resolve) => requestAnimationFrame(resolve));

    if (trueBox.checked) return this.sendResponseToService(true);

    trueBox.click();

    const saveButton = document.getElementById('optOutControl');
    if (saveButton) saveButton.click();

    this.sendResponseToService(true);
}

  async googleSettings() {
    const offButton = document.querySelector('[aria-label="Turn off"]');
    if(offButton) return this.sendResponseToService(true);

    const onButton = document.querySelector('[aria-label="Turn on"]');
    if (onButton) this.addBlurEffect();
    onButton.click();

    const saveButton = document.querySelector('[jsname="Lnwj0b"]');
    saveButton.click();

    this.sendResponseToService(true);
  }

  async facebookActivityInformationSettings() {
    const reviewButton = await this.waitForElement('.x1lliihq.x193iq5w.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft');
    this.addBlurEffect();
    reviewButton.click();

    const trueBox = await this.waitForElement('[name="radio1"]');

    if (trueBox.checked) return this.sendResponseToService(true);

    await new Promise((resolve) => requestAnimationFrame(resolve));
    trueBox.click();

    const buttons = document.querySelectorAll('.x1lliihq.x193iq5w.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft');
    const confirmButton = buttons[buttons.length - 1];
    confirmButton.click();

    this.sendResponseToService(true);
  }

  async facebookAudienceSettings() {
    const processElement = async (el) => {
      if (el) {
        el.click();

        await new Promise((resolve) => requestAnimationFrame(resolve));

        const openSettingsButton = await this.waitForElement('a[href^="/ad_preferences/ad_settings/audience_based_advertising"][aria-label="You may have interacted with their website, app or store."], a[href^="/ad_preferences/ad_settings/audience_based_advertising"][aria-label="They uploaded or used a list to reach you."]');
        if (openSettingsButton.ariaLabel === 'They uploaded or used a list to reach you.') {
          await new Promise((resolve) => requestAnimationFrame(resolve));

          const backButtons = await this.waitForElements('[aria-label="Back"]');

          if (backButtons.length > 0) {
            backButtons[backButtons.length - 1].click();

          }
          return;
        }

        openSettingsButton.click();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const darkElements = await this.waitForElements('.__fb-dark-mode.x1n2onr6.xzkaem6');
        darkElements.forEach((darkElement) => darkElement.style.display = 'none');

        await new Promise((resolve) => requestAnimationFrame(resolve));
        const toggleAdsButton = await this.waitForElement('[role="listitem"] [role="button"]');

        if (toggleAdsButton && toggleAdsButton.textContent === 'Hide ads') {
          toggleAdsButton.click()
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        await new Promise((resolve) => requestAnimationFrame(resolve));
        const backButtons = await this.waitForElements('[aria-label="Back"]');

        if (backButtons.length > 0) {
          backButtons[backButtons.length - 1].click()
        }

        await new Promise((resolve) => requestAnimationFrame(resolve));
        const secondDarkElements = await this.waitForElements('.__fb-dark-mode.x1n2onr6.xzkaem6');
        secondDarkElements.forEach((darkElement) => darkElement.style.display = 'none');

        await new Promise((resolve) => requestAnimationFrame(resolve));
        const exitButtons = await this.waitForElements('[aria-label="Back"]');

        if (exitButtons.length > 0) {
            exitButtons[exitButtons.length - 1].click();
        }
      }
    };

    let index = 0;
    let blurApplied = false;

    while (true) {
      const seeMoreButton = await this.waitForElement('[role="button"] [role="presentation"]');

      if (!blurApplied) {
        this.addBlurEffect();
        blurApplied = true;
      }

      if (seeMoreButton) seeMoreButton.click();

      await new Promise((resolve) => requestAnimationFrame(resolve));

      const elements = Array.from(document.querySelectorAll('[data-visualcompletion="ignore-dynamic"] [role="presentation"]'));

      if (index >= elements.length) break;

      await processElement(elements[index]);

      if (index === elements.length - 1) {
        this.sendResponseToService(true);
      }

      index++;
    }
}

  async waitForElements(selector) {
    return new Promise((resolve) => {
      const elements = document.querySelectorAll(selector);

      if (elements.length > 0) {
        resolve(elements);
      } else {
        const observer = new MutationObserver((mutations) => {
          const newElements = document.querySelectorAll(selector);

          if (newElements.length > 0) {
            resolve(newElements);
            observer.disconnect();
          }
        });

        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
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
      action: 'webmunkExt.adPersonalization.settingsResponse',
      response
    });
  }
}

const adPersonalization = new AdPersonalization();
adPersonalization.initialize();