// dont remove next line, all webmunk modules use messenger utility
// @ts-ignore
import { messenger } from "@webmunk/utils";
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth/web-extension';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { RudderStack } from './Rudderstack';
import { WEBMUNK_URL } from '../config';
import { FIREBASE_CONFIG } from '../config';
import { NotificationService } from './NotificationService';
import { AdPersonalizationItem, SurveyItem } from '../types';
import { DELAY_BETWEEN_SURVEY, DELAY_BETWEEN_AD_PERSONALIZATION } from '../config';

// this is where you could import your webmunk modules worker scripts
import "@webmunk/extension-ads/worker";
import "@webmunk/cookies-scraper/worker";
import "@webmunk/ad-personalization/worker";

enum events {
  SURVEY_COMPLETED = 'survey_completed',
}

enum NotificationText {
  FILL_OUT = 'You have to fill out the survey. Go to the extension',
  REMOVE = 'Please uninstall the Webmunk extension!'
}

export class Worker {
  private surveys: SurveyItem[] = [];
  private completedSurveys: SurveyItem[] = [];
  private rudderStack: RudderStack;
  private notificationService: NotificationService;
  private firebaseApp: any;

  constructor() {
    this.firebaseApp = initializeApp(FIREBASE_CONFIG);
    this.rudderStack = new RudderStack();
    this.notificationService = new NotificationService();
  }

  public async initialize(): Promise<void> {
    messenger.addReceiver('appMgr', this);
    messenger.addModuleListener('ads-scraper', this.onModuleEvent.bind(this));
    messenger.addModuleListener('cookies-scraper', this.onModuleEvent.bind(this));
    messenger.addModuleListener('ad-personalization', this.onModuleEvent.bind(this));
    chrome.tabs.onUpdated.addListener(this.surveyCompleteListener.bind(this));
    chrome.runtime.onMessage.addListener(this.onPopupMessage.bind(this),);

    await this.initSurveysIfNeeded();
  }

  private async onPopupMessage(request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
    if (request.action === 'webmunkExt.popup.loginReq') {
      await this.handleLogin(request.username);
    } else if (request.action === 'webmunkExt.popup.successRegister') {
      await this.startWeekTiming();
    }
  }

  private async initSurveysIfNeeded(): Promise<void> {
    const { identifier } = await chrome.storage.local.get('identifier');
    if (!identifier) return;

    const isWeekPassed = await this.isWeekPassed();
    if (!isWeekPassed) return;

    const tabId = await this.getActiveTabId();
    if (!tabId) return;

    const initialSurveyCount = this.surveys.length;

    await this.initSurveys();

    if (this.surveys.length > initialSurveyCount) {
      await this.startWeekTiming();
      await this.notificationService.showNotification(tabId, NotificationText.FILL_OUT);
    }
  }

  private async checkPersonalizationIfNeeded(): Promise<void> {
    const { personalizationTime } = await chrome.storage.local.get('personalizationTime');
    if (!personalizationTime) return;

    const delayBetweenAdPersonalization = +DELAY_BETWEEN_AD_PERSONALIZATION;
    const currentDate = Date.now();

    if (currentDate < delayBetweenAdPersonalization + personalizationTime) return;

    const adPersonalizationResult = await chrome.storage.local.get('adPersonalization.items');
    const adPersonalization: AdPersonalizationItem[] = adPersonalizationResult['adPersonalization.items'] || [];

    const tabId = await this.getActiveTabId();
    if (!tabId) return;

    adPersonalization.forEach((item) => {
      chrome.tabs.sendMessage(
        tabId,
        { action: 'webmunkExt.worker.notifyAdPersonalization',  data: { key: item.key }},
        { frameId: 0 }
      );
    });

    await chrome.storage.local.set({ personalizationTime: currentDate });
  }

  private async removeExtensionIfNeeded(): Promise<void> {
    const completedSurveysResult = await chrome.storage.local.get('completedSurveys');
    const completedSurveys = completedSurveysResult.completedSurveys || [];

    if (completedSurveys.length !== 2) return;

    const { removeModalShowed = 0 } = await chrome.storage.local.get('removeModalShowed');
    const currentDate = Date.now();
    const delayBetweenRemoveNotification = +DELAY_BETWEEN_SURVEY;

    if (currentDate - removeModalShowed < delayBetweenRemoveNotification) return;

    const tabId = await this.getActiveTabId();
    if (!tabId) return;

    await chrome.storage.local.set({ removeModalShowed: currentDate });
    await this.notificationService.showNotification(tabId, NotificationText.REMOVE);
  }

  private async getActiveTabId(): Promise<number> {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];

        if (!tab || !tab.id || tab.url?.startsWith('chrome://')) {
          resolve(0);
        } else {
          resolve(tab.id);
        }
      });
    })
  }

  private async middleware(): Promise<void> {
    await this.checkPersonalizationIfNeeded();
    await this.initSurveysIfNeeded();
    await this.removeExtensionIfNeeded();
  }

  private async startWeekTiming(): Promise<void> {
    const currentDate = Date.now();
    const delayBetweenSurvey = +DELAY_BETWEEN_SURVEY;

    const endTime = currentDate + delayBetweenSurvey;

    await chrome.storage.local.set({ weekEndTime: endTime });
  }

  private async isWeekPassed(): Promise<boolean> {
    const { weekEndTime } = await chrome.storage.local.get('weekEndTime');
    const currentTime = Date.now();

    return currentTime >= weekEndTime;
  }

  private async handleLogin(username: string): Promise<any> {
    try {
      const auth = getAuth();
      const functions = getFunctions();

      await signInAnonymously(auth);
      const signIn = httpsCallable(functions, 'signIn');
      const response = await signIn({ prolificId: username });

      chrome.runtime.sendMessage({ action: 'webmunkExt.popup.loginRes', data: response.data });
    } catch (e) {
      console.log(e);
    }
  }

  private async onModuleEvent(event: string, data: any): Promise<void> {
    await this.middleware();
    await this.rudderStack.track(event, data);
  }

  private async initSurveys(): Promise<void> {
    const result = await chrome.storage.local.get('completedSurveys');
    this.completedSurveys = result.completedSurveys || [];
    await this.loadSurveys();
  }

  private async loadSurveys(): Promise<void> {
    const { identifier, lastSurveyIndex = -1 } = await chrome.storage.local.get(['identifier', 'lastSurveyIndex']);
    const prolificId = identifier?.prolificId;

    const response = await fetch(chrome.runtime.getURL('data/surveys.json'));
    const data: SurveyItem[] = await response.json();

    const nextSurveyIndex = lastSurveyIndex + 1;

    if (nextSurveyIndex < data.length) {
      const surveyData = data[nextSurveyIndex];
      const newSurvey: SurveyItem = {
        name: surveyData.name,
        url: `${surveyData.url}?prolific_id=${prolificId}`,
      };

      if (!this.surveys.some((survey) => survey.url === newSurvey.url) &&
        !this.completedSurveys.some((survey) => survey.url === newSurvey.url)) {
        this.surveys.push(newSurvey);
      }

      await chrome.storage.local.set({ lastSurveyIndex: nextSurveyIndex });
    }

    await chrome.storage.local.set({ surveys: this.surveys });
  }

  private async saveParamsToStorage(params: Record<string, boolean>): Promise<void> {
    await chrome.storage.local.set({ personalizationConfigs: params });
  }

  private extractQueryParams(url: string): Record<string, boolean> {
    const params: Record<string, boolean> = {};
    const queryString = url.split('?')[1];

    if (queryString) {
      const urlParams = new URLSearchParams(queryString);

      urlParams.forEach((value, key) => {
        params[key] = value.toLowerCase() === 'true';
      });
    }

    return params;
  }

  async surveyCompleteListener(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): Promise<void> {
    const baseUrl = new URL(WEBMUNK_URL).origin;

    if (changeInfo.status !== 'complete' || !tab.url?.startsWith(baseUrl)) {
      return;
    }

    const openerTabId = tab.openerTabId;
    const openerTabUrl = openerTabId ? (await chrome.tabs.get(openerTabId)).url : undefined;

    if (openerTabUrl && this.surveys.some((survey) => openerTabUrl === survey.url)) {
      const queryParams = this.extractQueryParams(tab.url!);
      await this.saveParamsToStorage(queryParams);

      await chrome.tabs.remove(tab.openerTabId!);

      if (this.completedSurveys.some((completedSurvey) => completedSurvey.url === openerTabUrl)) return;

      const completedSurvey = this.surveys.find((survey) => survey.url === openerTabUrl);
      if (completedSurvey) this.completedSurveys.push(completedSurvey);

      this.surveys = this.surveys.filter((survey) => survey.url !== openerTabUrl);

      await chrome.storage.local.set({ surveys: this.surveys, completedSurveys: this.completedSurveys });

      console.log(`The survey ${openerTabUrl} was completed`);
      await this.startWeekTiming();
      await this.rudderStack.track(events.SURVEY_COMPLETED, { surveyUrl: openerTabUrl });
    }
  }
}
