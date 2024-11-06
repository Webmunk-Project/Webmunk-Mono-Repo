// dont remove next line, all webmunk modules use messenger utility
// @ts-ignore
import { messenger } from '@webmunk/utils';
import { NotificationService } from './NotificationService';
import { AdPersonalizationItem, User } from '../types';
import { DELAY_BETWEEN_REMOVE_NOTIFICATION, DELAY_BETWEEN_AD_PERSONALIZATION } from '../config';
import { RudderStackService } from './RudderStackService';
import { FirebaseAppService } from './FirebaseAppService';
import { ConfigService } from './ConfigService';
import { SurveyService } from './SurveyService';
import { NotificationText } from '../enums';
import { getActiveTabId } from './utils';

// this is where you could import your webmunk modules worker scripts
import "@webmunk/extension-ads/worker";
import "@webmunk/cookies-scraper/worker";
import "@webmunk/ad-personalization/worker";

if (typeof window === "undefined") {
  // @ts-ignore
  global.window = self;
}

export class Worker {
  private readonly firebaseAppService: FirebaseAppService;
  private readonly configService: ConfigService;
  private readonly rudderStack: RudderStackService;
  private readonly notificationService: NotificationService;
  private readonly surveyService: SurveyService;

  constructor() {
    this.firebaseAppService = new FirebaseAppService();
    this.configService = new ConfigService(this.firebaseAppService);
    this.rudderStack = new RudderStackService(this.firebaseAppService);
    this.notificationService = new NotificationService();
    this.surveyService = new SurveyService(this.configService, this.notificationService, this.rudderStack);
  }

  public async initialize(): Promise<void> {
    await this.firebaseAppService.login();
    await this.surveyService.initSurveysIfExists();

    messenger.addReceiver('appMgr', this);
    messenger.addModuleListener('ads-scraper', this.onModuleEvent.bind(this));
    messenger.addModuleListener('cookies-scraper', this.onModuleEvent.bind(this));
    messenger.addModuleListener('ad-personalization', this.onModuleEvent.bind(this));
    chrome.runtime.onMessage.addListener(this.onPopupMessage.bind(this),);
  }

  private async onModuleEvent(event: string, data: any): Promise<void> {
    await this.middleware();
    await this.rudderStack.track(event, data);
  }

  private async middleware(): Promise<void> {
    const user = await this.firebaseAppService.getUser();

    if (!user) return

    await this.showRemoveExtensionIfNeeded(user);

    if (!user.active) return

    await this.checkPersonalizationIfNeeded();
    await this.surveyService.initSurveysIfNeeded();
  }

  private async onPopupMessage(request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
    if (request.action === 'webmunkExt.popup.loginReq') {
      const userData = await this.firebaseAppService.login(request.username);
      await chrome.runtime.sendMessage({ action: 'webmunkExt.popup.loginRes', data: userData });
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

    const tabId = await getActiveTabId();
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

  private async showRemoveExtensionIfNeeded(user: User): Promise<void> {
    const completedSurveysResult = await chrome.storage.local.get('completedSurveys');
    const completedSurveys = completedSurveysResult.completedSurveys || [];

    if (completedSurveys.length === 2 || !user.active) {
      await this.showRemoveExtensionNotification();
    }
  }

  private async showRemoveExtensionNotification(): Promise<void> {
    const { removeModalShowed = 0 } = await chrome.storage.local.get('removeModalShowed');
    const currentDate = Date.now();
    const delayBetweenRemoveNotification = Number(DELAY_BETWEEN_REMOVE_NOTIFICATION);

    if (currentDate - removeModalShowed < delayBetweenRemoveNotification) return;

    const tabId = await getActiveTabId();
    if (!tabId) return;

    await chrome.storage.local.set({ removeModalShowed: currentDate });
    await this.notificationService.showNotification(tabId, NotificationText.REMOVE);
  }
}