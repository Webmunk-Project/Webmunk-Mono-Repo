import { ENROLL_URL } from '../config';
import { Notification } from './Notification';

interface AdPersonalizationItem {
  key: string;
  name: string;
  url: string;
}

interface SurveyItem {
  name: string;
  url: string;
}

class Popup {
  private continueButton: HTMLButtonElement;
  private logInInput: HTMLInputElement;
  private toggleInput: HTMLInputElement;
  private authInputLabel: HTMLElement;
  private getStartedContainer: HTMLElement;
  private studyExtensionContainer: HTMLElement;
  private adPersonalizationContainer: HTMLElement;
  private copyButton: HTMLButtonElement;
  private adPersonalizationButton: HTMLButtonElement;
  private formattedIdentifier: HTMLElement;
  private closeAdPersonalizationButton: HTMLButtonElement;
  private adPersonalizationList: HTMLElement;
  private checkAdPersonalizationButton: HTMLButtonElement;
  private fullIdentifier: string;
  private notification: Notification;
  private isEmailMode: boolean;

  constructor() {
    this.continueButton = document.getElementById('continueButton') as HTMLButtonElement;
    this.logInInput = document.getElementById('logInInput') as HTMLInputElement;
    this.toggleInput = document.getElementById('toggleInput') as HTMLInputElement;
    this.authInputLabel = document.getElementById('authInputLabel') as HTMLElement;
    this.getStartedContainer = document.getElementById('getStartedContainer') as HTMLElement;
    this.studyExtensionContainer = document.getElementById('studyExtensionContainer') as HTMLElement;
    this.adPersonalizationContainer = document.getElementById('adPersonalizationContainer') as HTMLElement;
    this.copyButton = document.getElementById('copyButton') as HTMLButtonElement;
    this.adPersonalizationButton = document.getElementById('ad-personalization-button') as HTMLButtonElement;
    this.formattedIdentifier = document.getElementById('formattedIdentifier') as HTMLElement;
    this.closeAdPersonalizationButton = document.getElementById('close-ad-personalization-button') as HTMLButtonElement;
    this.adPersonalizationList = document.getElementById('adPersonalizationListContainer') as HTMLButtonElement;
    this.checkAdPersonalizationButton = document.getElementById('check-ad-personalization-button') as HTMLButtonElement;
    this.fullIdentifier = '';
    this.notification = new Notification();
    this.isEmailMode = false;

    this.init();
  }

  private init(): void {
    this.initListeners();
    this.initView();
    this.initSurveys();
  }

  private initListeners(): void {
    this.continueButton.addEventListener('click', () => this.onContinueButtonClick());
    this.copyButton.addEventListener('click', () => this.copyIdentifier());
    this.adPersonalizationButton.addEventListener('click', () => this.showAdPersonalizationContainer());
    this.closeAdPersonalizationButton.addEventListener('click', () => this.closeAdPersonalization());
    this.checkAdPersonalizationButton.addEventListener('click', () => this.checkAdPersonalization());
    this.adPersonalizationList.addEventListener('click', (event) => this.handleAdPersonalizationClick(event));
    this.toggleInput.addEventListener('change', () => this.toggleInputMode());
  }

  private closeAdPersonalization(): void {
    this.adPersonalizationList.innerHTML = '';
    this.adPersonalizationContainer.style.display = 'none';
    this.studyExtensionContainer.style.display = 'block';
  }

  private toggleInputMode() {
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

  private async showAdPersonalizationContainer() {
    this.studyExtensionContainer.style.display = 'none';
    this.adPersonalizationContainer.style.display = 'block';

    const adPersonalizationContent = await this.initAdPersonalization();
    adPersonalizationContent.classList.add('list');

    this.adPersonalizationList.appendChild(adPersonalizationContent);
  }

  private async checkAdPersonalization(): Promise<void> {
    const listItems = Array.from(this.adPersonalizationList.querySelectorAll('li a'));

    for (const link of listItems) {
      const anchorElement = link as HTMLAnchorElement;
      const key = anchorElement.getAttribute('key');
      chrome.runtime.sendMessage({ action: 'webmunkExt.popup.checkSettingsReq',  key });
    }
  }

  private async isNeedToDisplayAdPersonalizationButton(): Promise<boolean> {
    const specifiedItemResult = await chrome.storage.local.get('queryParams');
    const specifiedItem = specifiedItemResult.queryParams || {};

    return Object.keys(specifiedItem).length > 0;
  }

  private handleAdPersonalizationClick(event: Event): void {
    const target = (event.target as HTMLElement).closest('a');

    if (target) {
      const key = target.getAttribute('key');
      chrome.runtime.sendMessage({ action: 'webmunkExt.popup.checkSettingsReq', key });
    }
  }

  private async onContinueButtonClick() {
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

  private validateInput(inputValue: string): boolean {
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

  private async getIdentifier(email: string): Promise<string | null> {
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
      this.notification.error('Error occurred while fetching identifier');
      return null;
    }
  }

  private async showStudyExtensionContainer(identifier: string): Promise<void> {
    this.getStartedContainer.style.display = 'none';
    this.studyExtensionContainer.style.display = 'block';
    this.formattedIdentifier.innerHTML = this.formatIdentifier(identifier);
    this.fullIdentifier = identifier;

    const isNeedToDisplay = await this.isNeedToDisplayAdPersonalizationButton();

    if (isNeedToDisplay) {
      this.adPersonalizationButton.style.display = 'block';
    } else {
      this.adPersonalizationButton.style.display = 'none';
    }
  }

  private showGetStartedContainer(): void {
    this.getStartedContainer.style.display = 'block';
    this.studyExtensionContainer.style.display = 'none';
  }

  private formatIdentifier(identifier: string): string {
    const firstTenSymbols = identifier.substring(0, 10);
    const lastTenSymbols = identifier.substring(identifier.length - 10);

    return `${firstTenSymbols}...${lastTenSymbols}`;
  }

  private async initView(): Promise<void> {
    const result = await chrome.storage.local.get('identifier');
    const identifier = result.identifier;

    identifier ? this.showStudyExtensionContainer(identifier) : this.showGetStartedContainer();
  }

  private async initAdPersonalization(): Promise<HTMLUListElement> {
    const adPersonalizationResult = await chrome.storage.local.get('adPersonalization.items');
    const checkedAdPersonalizationResult = await chrome.storage.local.get('adPersonalization.checkedItems');
    const invalidItemsResult = await chrome.storage.local.get('adPersonalization.invalidItems');

    const adPersonalization: AdPersonalizationItem[] = adPersonalizationResult['adPersonalization.items'] || [];
    const checkedAdPersonalization = checkedAdPersonalizationResult['adPersonalization.checkedItems'] || {};
    const invalidItems = invalidItemsResult['adPersonalization.invalidItems'] || [];

    const settingsList = document.createElement('ul');

    adPersonalization.forEach((list) => {
      const listItem = document.createElement('li');
      const link = document.createElement('a');
      link.textContent = list.name;
      link.setAttribute('key', list.key);
      listItem.appendChild(link);

      const invalidItem = invalidItems.find((item: { key: string, error: string }) => item.key === list.key);
      if (invalidItem) {
        const invalidMark = document.createElement('span');
        invalidMark.classList.add('tooltip');
        invalidMark.textContent = '⚠️';
        invalidMark.style.marginLeft = '8px';

        const tooltipText = document.createElement('span');
        tooltipText.classList.add('tooltiptext');

        tooltipText.textContent = invalidItem.error;

        invalidMark.appendChild(tooltipText);
        listItem.appendChild(invalidMark);
      } else if (checkedAdPersonalization[list.key]) {
        const checkmark = document.createElement('span');
        checkmark.textContent = '✅';
        checkmark.style.marginLeft = '8px';
        listItem.appendChild(checkmark);
      }

      settingsList.appendChild(listItem);
    });

    return settingsList;
  }

  private async initSurveys(): Promise<void> {
    const result = await chrome.storage.local.get('surveys');
    const surveys: SurveyItem[] = result.surveys || [];
    const taskList = document.getElementById('task-list') as HTMLElement;
    const tasksStatus = document.getElementById('tasks-status') as HTMLElement;

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

  private async copyIdentifier(): Promise<void> {
    await navigator.clipboard.writeText(this.fullIdentifier);
    this.notification.info('Identifier copied to clipboard');
  }

  private setButtonState(isDisabled: boolean, text: string): void {
    this.continueButton.disabled = isDisabled;
    this.continueButton.textContent = text;
  }

  private emailValidation(email: string): boolean {
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailPattern.test(email);
  }

  private prolificIdValidation(id: string): boolean {
    const idPattern = /^[a-fA-F0-9]{24}$/;
    return idPattern.test(id);
  }
}

document.addEventListener('DOMContentLoaded', () => new Popup());