import { ENROLL_URL } from '../config';
import { Notification } from './notification';

class Popup {
  constructor() {
    this.continueButton = document.getElementById('continueButton');
    this.emailInput = document.getElementById('emailInput');
    this.getStartedContainer = document.getElementById('getStartedContainer');
    this.studyExtensionContainer = document.getElementById('studyExtensionContainer');
    this.settingsManagementContainer = document.getElementById('settingsManagementContainer');
    this.copyButton = document.getElementById('copyButton');
    this.settingsButton = document.getElementById('settings-button');
    this.formattedIdentifier = document.getElementById('formattedIdentifier');
    this.closeSettingsButton = document.getElementById('close-settings-button');
    this.settingsList = document.getElementById('settingsListContainer');
    this.checkSettingsButton = document.getElementById('check-settings-button');
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
    this.settingsButton.addEventListener('click', () => this.showSettingsManagements());
    this.closeSettingsButton.addEventListener('click', () => this.closeSettings());
    this.checkSettingsButton.addEventListener('click', () => this.checkSettings());
    this.settingsList.addEventListener('click', (event) => this.handleSettingsClick(event));
  }

  closeSettings() {
    this.settingsList.innerHTML = '';
    this.settingsManagementContainer.style.display = 'none';
    this.studyExtensionContainer.style.display = 'block';
  }

  async showSettingsManagements() {
    this.studyExtensionContainer.style.display = 'none';
    this.settingsManagementContainer.style.display = 'block';

    const settingsContent = await this.initSettings();
    settingsContent.classList.add('list');

    this.settingsList.appendChild(settingsContent);
  }

  async checkSettings() {
    const listItems = this.settingsList.querySelectorAll('li a');

    for (const link of listItems) {
      const url = link.href;
      const key = link.getAttribute('key');
      chrome.runtime.sendMessage({ action: 'webmunkExt.popup.settingsClicked',  data: { url, key } });
    }
}

  handleSettingsClick(event) {
    const target = event.target.closest('a');

    if (target) {
      const url = target.href;
      const key = target.getAttribute('key');
      chrome.runtime.sendMessage({ action: 'webmunkExt.popup.settingsClicked', data: { url, key } });
    }
  }

  async onContinueButtonClick() {
    const email = this.emailInput.value.trim().toLowerCase();

    if (!email) {
      this.notification.warning('Please enter an e-mail address to continue.');
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

  async initSettings() {
    const settingsResult = await chrome.storage.local.get('settings');
    const checkedSettingsResult = await chrome.storage.local.get('checkedSettings');

    const settings = settingsResult.settings || [];
    const checkedSettings = checkedSettingsResult.checkedSettings || {};

    const settingsList = document.createElement('ul');

    settings.forEach((list) => {
      const listItem = document.createElement('li');
      const link = document.createElement('a');
      link.href = list.url;
      link.textContent = list.name;
      link.setAttribute('key', list.key);
      listItem.appendChild(link);

      if (checkedSettings[list.url]) {
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
}

document.addEventListener('DOMContentLoaded', () => new Popup());