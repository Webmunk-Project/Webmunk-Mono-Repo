import { ENROLL_URL } from '../config';
import { Notification } from './notification';

class Popup {
  constructor() {
    this.continueButton = document.getElementById('continueButton');
    this.emailInput = document.getElementById('emailInput');
    this.getStartedContainer = document.getElementById('getStartedContainer');
    this.studyExtensionContainer = document.getElementById('studyExtensionContainer');
    this.copyButton = document.getElementById('copyButton');
    this.formattedIdentifier = document.getElementById('formattedIdentifier');
    this.fullIdentifier = '';
    this.notification = new Notification();

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
  }

  async onContinueButtonClick() {
    const email = this.emailInput.value.trim().toLowerCase();

    if (!email) {
      this.notification.warning('Please enter an e-mail address to continue.');
      return;
    }

    if (!this.emailValidation(email)) {
      this.notification.warning('Please enter a valid e-mail address.');
      return;
    }

    this.setButtonState(true, 'Wait...');

    const identifier = await this.getIdentifier(email);

    if (!identifier) {
      this.notification.warning('Enrollment hiccup!\nPlease give it another shot a bit later. We appreciate your patience!');
      this.setButtonState(false, 'Continue');
      return;
    }

    await chrome.storage.local.set({ identifier });
    this.showStudyExtensionContainer(identifier);
    chrome.runtime.sendMessage({ action: 'cookiesAppMgr.checkPrivacy' });
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
}

document.addEventListener('DOMContentLoaded', () => new Popup());