// dont remove next line, all webmunk modules use messenger utility
// @ts-ignore
import { messenger } from '@webmunk/utils';
import { getAuth, signInAnonymously } from 'firebase/auth/web-extension';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { NotificationService } from './NotificationService';
import { AdPersonalizationItem } from '../types';
import { DELAY_BETWEEN_SURVEY, DELAY_BETWEEN_AD_PERSONALIZATION } from '../config';
import { RudderStack } from './Rudderstack';
import { FirebaseAppService } from './FirebaseAppService';
import { ConfigService } from './ConfigService';
import { SurveyService } from './SurveyService';
import { NotificationText } from '../enums';

// this is where you could import your webmunk modules worker scripts
import "@webmunk/extension-ads/worker";
import "@webmunk/cookies-scraper/worker";
import "@webmunk/ad-personalization/worker";

if (typeof window === "undefined") {
  // @ts-ignore
  global.window = self;
}

export class Worker {
  private firebaseAppService: FirebaseAppService;
  private configService: ConfigService;
  private rudderStack: RudderStack;
  private notificationService: NotificationService;
  private surveyService: SurveyService;

  constructor() {
    this.firebaseAppService = new FirebaseAppService();
    this.configService = new ConfigService(this.firebaseAppService);
    this.rudderStack = new RudderStack();
    this.notificationService = new NotificationService();
    this.surveyService = new SurveyService(this.configService);
  }

  public async initialize(): Promise<void> {
    messenger.addReceiver('appMgr', this);
    messenger.addModuleListener('ads-scraper', this.onModuleEvent.bind(this));
    messenger.addModuleListener('cookies-scraper', this.onModuleEvent.bind(this));
    messenger.addModuleListener('ad-personalization', this.onModuleEvent.bind(this));
    chrome.runtime.onMessage.addListener(this.onPopupMessage.bind(this),);

    await this.surveyService.initSurveysIfExists();
  }

  private async onPopupMessage(request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
    if (request.action === 'webmunkExt.popup.loginReq') {
      await this.handleLogin(request.username);
    } else if (request.action === 'webmunkExt.popup.successRegister') {
      await this.surveyService.startWeekTiming();
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
    await this.surveyService.initSurveysIfNeeded();
    await this.removeExtensionIfNeeded();
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
}