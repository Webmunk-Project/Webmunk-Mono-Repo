import { Notification } from './Notification';
import { AdPersonalizationItem, SurveyItem, User } from '../types';

class Popup {
  private continueButton: HTMLButtonElement;
  private logInInput: HTMLInputElement;
  private getStartedContainer: HTMLElement;
  private studyExtensionContainer: HTMLElement;
  private copyButton: HTMLButtonElement;
  private adPersonalizationButton: HTMLButtonElement;
  private formattedIdentifier: HTMLElement;
  private fullIdentifier: string;
  private notification: Notification;

  constructor() {
    this.continueButton = document.getElementById('continueButton') as HTMLButtonElement;
    this.logInInput = document.getElementById('logInInput') as HTMLInputElement;
    this.getStartedContainer = document.getElementById('getStartedContainer') as HTMLElement;
    this.studyExtensionContainer = document.getElementById('studyExtensionContainer') as HTMLElement;
    this.copyButton = document.getElementById('copyButton') as HTMLButtonElement;
    this.adPersonalizationButton = document.getElementById('ad-personalization-button') as HTMLButtonElement;
    this.formattedIdentifier = document.getElementById('formattedIdentifier') as HTMLElement;
    this.fullIdentifier = '';
    this.notification = new Notification();

    this.init();
  }

  private init(): void {
    this.initListeners();
    this.initView();
  }

  private initListeners(): void {
    this.continueButton.addEventListener('click', () => this.onContinueButtonClick());
    this.copyButton.addEventListener('click', () => this.copyIdentifier());
    this.adPersonalizationButton.addEventListener('click', () => this.checkAdPersonalization());
  }

  private async checkAdPersonalization(): Promise<void> {
    const listItems: AdPersonalizationItem [] = await this.initAdPersonalization();

    for (const link of listItems) {
      const key = link.key;
      chrome.runtime.sendMessage({ action: 'webmunkExt.popup.checkSettingsReq', data: { key, isNeedToLogin: true } });
    }

    await chrome.storage.local.set({ personalizationTime: Date.now() });
  }

  private async onContinueButtonClick() {
    const inputValue = this.logInInput.value.trim();

    if (!this.validateInput(inputValue)) {
      return;
    }

    this.setButtonState(true, 'Wait...');

    const user: User = await this.login(inputValue);

    if (!user) {
      this.notification.warning('Enrollment hiccup!\nPlease give it another shot a bit later. We appreciate your patience!');
      this.setButtonState(false, 'Continue');
      return;
    }

    await chrome.runtime.sendMessage({ action: 'webmunkExt.popup.successRegister' });
    setTimeout(() => this.showStudyExtensionContainer(user.uid), 100);
  }

  private validateInput(inputValue: string): boolean {
    if (!inputValue) {
      this.notification.warning('Please enter a Prolific ID.');
      return false;
    }

    const isValid = this.prolificIdValidation(inputValue);

    if (!isValid) {
      this.notification.warning('Please enter a valid Prolific ID (24 alphanumeric characters).');
      return false;
    }

    return true;
  }

  private async isNeedToEnabledAdPersonalizationButton(): Promise<boolean> {
    const completedSurveysResult = await chrome.storage.local.get('completedSurveys');
    const completedSurveys = completedSurveysResult.completedSurveys || [];

    const adPersonalization = await this.initAdPersonalization();
    const checkedAdPersonalizationResult = await chrome.storage.local.get('adPersonalization.checkedItems');
    const checkedAdPersonalization = checkedAdPersonalizationResult['adPersonalization.checkedItems'] || [];

    if (completedSurveys.length && checkedAdPersonalization.length < adPersonalization.length) return true;

    return false;
  }

  private makeAdPersonalizationButtonEnabled(): void {
    this.adPersonalizationButton.style.display = 'block';
  }

  private async login(username: string): Promise<User> {
    return new Promise((resolve) => {
      const messageHandler = (response: any) => {
        if (response.action === 'webmunkExt.popup.loginRes') {
          resolve(response.data);
          chrome.runtime.onMessage.removeListener(messageHandler);
        }
      };

      chrome.runtime.onMessage.addListener(messageHandler);

      chrome.runtime.sendMessage({ action: 'webmunkExt.popup.loginReq', username });
    });
   }


  private async showStudyExtensionContainer(uid: string): Promise<void> {
    this.getStartedContainer.style.display = 'none';
    this.studyExtensionContainer.style.display = 'block';
    this.initSurveys();
    this.formattedIdentifier.innerHTML = this.formatIdentifier(uid);
    this.fullIdentifier = uid;

    const isNeedToEnabled = await this.isNeedToEnabledAdPersonalizationButton();

    if (isNeedToEnabled) this.makeAdPersonalizationButtonEnabled();
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
    const result = await chrome.storage.local.get('user');
    const user = result.user as User;

    user ? await this.showStudyExtensionContainer(user.uid) : this.showGetStartedContainer();
  }

  private async initAdPersonalization(): Promise<AdPersonalizationItem[]> {
    const adPersonalizationResult = await chrome.storage.local.get('adPersonalization.items');
    const adPersonalization: AdPersonalizationItem[] = adPersonalizationResult['adPersonalization.items'] || [];

    return adPersonalization;
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

  private prolificIdValidation(id: string): boolean {
    const idPattern = /^[a-fA-F0-9]{24}$/;
    return idPattern.test(id);
  }
}

document.addEventListener('DOMContentLoaded', () => new Popup());