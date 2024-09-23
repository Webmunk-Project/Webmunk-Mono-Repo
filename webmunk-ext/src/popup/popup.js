import { ENROLL_URL } from '../config';
import { Notification } from './notification';

class Popup {
  constructor() {
    this.continueButton = document.getElementById('continueButton');
    this.logInInput = document.getElementById('logInInput');
    this.toggleInput = document.getElementById('toggleInput');
    this.authInputLabel = document.getElementById('authInputLabel');
    this.getStartedContainer = document.getElementById('getStartedContainer');
    this.studyExtensionContainer = document.getElementById('studyExtensionContainer');
    this.adPersonalizationContainer = document.getElementById('adPersonalizationContainer');
    this.copyButton = document.getElementById('copyButton');
    this.adPersonalizationButton = document.getElementById('ad-personalization-button');
    this.formattedIdentifier = document.getElementById('formattedIdentifier');
    this.closeAdPersonalizationButton = document.getElementById('close-ad-personalization-button');
    this.adPersonalizationList = document.getElementById('adPersonalizationListContainer');
    this.checkAdPersonalizationButton = document.getElementById('check-ad-personalization-button');
    this.fullIdentifier = '';
    this.notification = new Notification();
    this.isEmailMode = false;

    this.init();
  }

  init() {
    this.initListeners();
    this.initView();
    this.initSurveys();
  }

  initListeners() {
    this.continueButton.addEventListener('click', () => this.onContinueButtonClick());
    this.copyButton.addEventListener('click', () => this.copyIdentifier());
    this.adPersonalizationButton.addEventListener('click', () => this.showAdPersonalizationContainer());
    this.closeAdPersonalizationButton.addEventListener('click', () => this.closeAdPersonalization());
    this.checkAdPersonalizationButton.addEventListener('click', () => this.checkAdPersonalization());
    this.adPersonalizationList.addEventListener('click', (event) => this.handleAdPersonalizationClick(event));
    this.toggleInput.addEventListener('change', () => this.toggleInputMode());
  }

  closeAdPersonalization() {
    this.adPersonalizationList.innerHTML = '';
    this.adPersonalizationContainer.style.display = 'none';
    this.studyExtensionContainer.style.display = 'block';
  }

  toggleInputMode() {
    if (this.toggleInput.checked) {
      this.logInInput.type = 'email';
      this.logInInput.placeholder = 'Email';
      this.authInputLabel.textContent = 'email';
      this.isEmailMode = true;
    } else {
      this.logInInput.type = 'text';
      this.logInInput.placeholder = 'Prolific Id';
      this.authInputLabel.textContent = 'prolific id';
      this.isEmailMode = false;
    }
  }

  async showAdPersonalizationContainer() {
    this.studyExtensionContainer.style.display = 'none';
    this.adPersonalizationContainer.style.display = 'block';

    const adPersonalizationContent = await this.initAdPersonalization();
    adPersonalizationContent.classList.add('list');

    this.adPersonalizationList.appendChild(adPersonalizationContent);
  }

  async checkAdPersonalization() {
    const listItems = this.adPersonalizationList.querySelectorAll('li a');

    for (const link of listItems) {
      const url = link.href;
      const key = link.getAttribute('key');
      chrome.runtime.sendMessage({ action: 'webmunkExt.popup.checkSettingsReq',  data: { url, key } });
    }
}

  handleAdPersonalizationClick(event) {
    const target = event.target.closest('a');

    if (target) {
      const url = target.href;
      const key = target.getAttribute('key');
      chrome.runtime.sendMessage({ action: 'webmunkExt.popup.checkSettingsReq', data: { url, key } });
    }
  }

  async onContinueButtonClick() {
    const inputValue = this.logInInput.value.trim();

    if (!this.validateInput(inputValue)) {
      return;
    }

    this.setButtonState(true, 'Wait...');

    const identifier = await this.getIdentifier(inputValue);

    if (!identifier) {
      this.notification.warning('Enrollment hiccup!\nPlease give it another shot a bit later. We appreciate your patience!');
      this.setButtonState(false, 'Continue');
      return;
    }

    await chrome.storage.local.set({ identifier });
    this.showStudyExtensionContainer(identifier);
    chrome.runtime.sendMessage({ action: 'cookiesAppMgr.checkPrivacy' });
  }

  validateInput(inputValue) {
    if (!inputValue) {
      this.notification.warning(this.isEmailMode ? 'Please enter an email address.' : 'Please enter a Prolific ID.');
      return false;
    }

    const isValid = this.isEmailMode
      ? this.emailValidation(inputValue)
      : this.prolificIdValidation(inputValue);

    if (!isValid) {
      this.notification.warning(this.isEmailMode
        ? 'Please enter a valid e-mail address.'
        : 'Please enter a valid Prolific ID (24 alphanumeric characters).');
      return false;
    }

    return true;
  }

  async getIdentifier(email) {
    try {
      const response = await fetch(ENROLL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: email })
      });

      const data = await response.json();
      return data.userId;
    } catch (e) {
      this.notification.error(e);
      return null;
    }
  }

  showStudyExtensionContainer(identifier) {
    this.getStartedContainer.style.display = 'none';
    this.studyExtensionContainer.style.display = 'block';
    this.formattedIdentifier.innerHTML = this.formatIdentifier(identifier);
    this.fullIdentifier = identifier;
  }

  showGetStartedContainer() {
    this.getStartedContainer.style.display = 'block';
    this.studyExtensionContainer.style.display = 'none';
  }

  formatIdentifier(identifier) {
    const firstTenSymbols = identifier.substring(0, 10);
    const lastTenSymbols = identifier.substring(identifier.length - 10);

    return `${firstTenSymbols}...${lastTenSymbols}`;
  }

  async initView() {
    const result = await chrome.storage.local.get('identifier');
    const identifier = result.identifier;

    identifier ? this.showStudyExtensionContainer(identifier) : this.showGetStartedContainer();
  }

  async initAdPersonalization() {
    const adPersonalizationResult = await chrome.storage.local.get('adPersonalization.items');
    const checkedAdPersonalizationResult = await chrome.storage.local.get('adPersonalization.checkedItems');

    const adPersonalization = adPersonalizationResult['adPersonalization.items'] || [];
    const checkedAdPersonalization = checkedAdPersonalizationResult['adPersonalization.checkedItems'] || {};

    const settingsList = document.createElement('ul');

    adPersonalization.forEach((list) => {
      const listItem = document.createElement('li');
      const link = document.createElement('a');
      link.href = list.url;
      link.textContent = list.name;
      link.setAttribute('key', list.key);
      listItem.appendChild(link);

      if (checkedAdPersonalization[list.url]) {
        const checkmark = document.createElement('span');
        checkmark.textContent = '✔️';
        checkmark.style.marginLeft = '8px';
        listItem.appendChild(checkmark);
      }

      settingsList.appendChild(listItem);
    });

    return settingsList;
  }

  async initSurveys() {
    const result = await chrome.storage.local.get('surveys');
    const surveys = result.surveys || [];
    const taskList = document.getElementById('task-list');
    const tasksStatus = document.getElementById('tasks-status');

    taskList.innerHTML = '';

    surveys.forEach((survey) => {
      const listItem = document.createElement('li');
      const link = document.createElement('a');
      link.href = survey.url;
      link.textContent = survey.name;
      link.target = '_blank';
      listItem.appendChild(link);
      taskList.appendChild(listItem);
    });

    tasksStatus.textContent = surveys.length ? 'Please complete these tasks:' : 'All tasks are completed!';
  }

  async copyIdentifier() {
    await navigator.clipboard.writeText(this.fullIdentifier);
    this.notification.info('Identifier copied to clipboard');
  }

  setButtonState(isDisabled, text) {
    this.continueButton.disabled = isDisabled;
    this.continueButton.textContent = text;
  }

  emailValidation(email) {
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailPattern.test(email);
  }

  prolificIdValidation(id) {
    const idPattern = /^[a-fA-F0-9]{24}$/;
    return idPattern.test(id);
  }
}

document.addEventListener('DOMContentLoaded', () => new Popup());