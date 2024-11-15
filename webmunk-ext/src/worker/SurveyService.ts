import { SurveyItem } from '../types';
import { ConfigService } from './ConfigService';
import { WEBMUNK_URL } from '../config';
import { NotificationService } from './NotificationService';
import { NotificationText, UrlParameters } from '../enums';
import { DELAY_BETWEEN_SURVEY, DELAY_BETWEEN_FILL_OUT_NOTIFICATION, DELAY_WHILE_AD_BLOCKER } from '../config';
import { RudderStackService } from './RudderStackService';
import { getActiveTabId, isNeedToDisableSurveyLoading } from './utils';
import { FirebaseAppService } from './FirebaseAppService';

enum events {
  SURVEY_COMPLETED = 'survey_completed',
}

export class SurveyService {
  private surveys: SurveyItem[] = [];
  private completedSurveys: SurveyItem[] = [];
  private readonly configService: ConfigService;

  constructor(
    private readonly firebaseAppService: FirebaseAppService,
    private readonly notificationService: NotificationService,
    private readonly rudderStack: RudderStackService
  ) {
    chrome.tabs.onUpdated.addListener(this.surveyCompleteListener.bind(this));
    this.configService = new ConfigService(this.firebaseAppService);
  }

  public async initSurveysIfNeeded(): Promise<void> {
    if (await isNeedToDisableSurveyLoading()) return;

    if (this.surveys.length) {
      await this.showFillOutNotification();
      return;
    }

    const isWeekPassed = await this.isWeekPassed();
    if (!isWeekPassed) return;

    const tabId = await getActiveTabId();
    if (!tabId) return;

    await this.loadSurveys();
  }

  private async showFillOutNotification(): Promise<void> {
    const currentDate = Date.now();
    const delayBetweenFillOutNotification = Number(DELAY_BETWEEN_FILL_OUT_NOTIFICATION);
    const { fillOutModalShowed = 0 } = await chrome.storage.local.get('fillOutModalShowed');

    if (currentDate < fillOutModalShowed + delayBetweenFillOutNotification) return;

    const tabId = await getActiveTabId();
    if (!tabId) return;

    await chrome.storage.local.set({ fillOutModalShowed: currentDate });
    await this.notificationService.showNotification(tabId, NotificationText.FILL_OUT);
  }

  public async initSurveysIfExists(): Promise<void> {
    const existingSurveys = await chrome.storage.local.get('surveys');
    this.surveys = existingSurveys.surveys || [];

    const existingCompletedSurveys = await chrome.storage.local.get('completedSurveys');
    this.completedSurveys = existingCompletedSurveys.completedSurveys || [];
  }

  private async loadSurveys(): Promise<void> {
    const { user, lastSurveyIndex = -1 } = await chrome.storage.local.get(['user', 'lastSurveyIndex']);
    const prolificId = user?.prolificId;

    const jsonSurveys = await this.configService.getConfigByKey('surveys');
    const surveys: SurveyItem[] = JSON.parse(jsonSurveys);

    const nextSurveyIndex = lastSurveyIndex + 1;

    if (nextSurveyIndex < surveys.length) {
      const surveyData = surveys[nextSurveyIndex];
      const newSurvey: SurveyItem = {
        name: surveyData.name,
        url: `${surveyData.url}?PROLIFIC_PID=${prolificId}`,
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

  private async adBlockerManipulations(url: string): Promise<void> {
    if (await isNeedToDisableSurveyLoading()) return;

    const queryParams = this.extractQueryParams(url);
    await this.saveParamsToStorage(queryParams);

    await this.startWeekTiming(true);
  }

  private async configurationManipulation(url: string): Promise<void> {
    const adPersonalizationConfiguration = [
      UrlParameters.FACEBOOK,
      UrlParameters.GOOGLE_AND_YOUTUBE,
      UrlParameters.AMAZON
    ];

    const isAdPersonalizationConfiguration = adPersonalizationConfiguration.some((param) => url.includes(param));

    if (isAdPersonalizationConfiguration) await this.clearCheckedAdPersonalizationIfExists();
  }

  public async surveyCompleteListener(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): Promise<void> {
    const user = await this.firebaseAppService.getUser();

    if (!user) return

    const baseUrl = new URL(WEBMUNK_URL).origin;

    if (changeInfo.status !== 'complete' || !tab.url?.startsWith(baseUrl)) {
      return;
    }

    if (tab.url?.startsWith(`${WEBMUNK_URL}?${UrlParameters.AD_BLOCKER}`)) {
      await this.adBlockerManipulations(tab.url);
      return;
    }

    const openerTabId = tab.openerTabId;
    const openerTabUrl = openerTabId ? (await chrome.tabs.get(openerTabId)).url : undefined;

    if (openerTabUrl && this.surveys?.some((survey) => openerTabUrl === survey.url)) {
      const queryParams = this.extractQueryParams(tab.url!);
      await this.saveParamsToStorage(queryParams);

      await chrome.tabs.remove(tab.openerTabId!);

      if (this.completedSurveys.some((completedSurvey) => completedSurvey.url === openerTabUrl)) return;

      const completedSurvey = this.surveys.find((survey) => survey.url === openerTabUrl);
      if (completedSurvey) this.completedSurveys.push(completedSurvey);

      this.surveys = this.surveys.filter((survey) => survey.url !== openerTabUrl);

      await chrome.storage.local.set({ surveys: this.surveys, completedSurveys: this.completedSurveys });
      await this.configurationManipulation(tab.url);

      await this.startWeekTiming();
      await this.rudderStack.track(events.SURVEY_COMPLETED, { surveyUrl: openerTabUrl });
    }
  }

  private async clearCheckedAdPersonalizationIfExists(): Promise<void> {
    const checkedAdPersonalizationResult = await chrome.storage.local.get('adPersonalization.checkedItems');
    const checkedAdPersonalization = checkedAdPersonalizationResult['adPersonalization.checkedItems'] || {};

    if (!Object.keys(checkedAdPersonalization).length) return;

    await chrome.storage.local.set({ 'adPersonalization.checkedItems': {} });
    await chrome.storage.local.set({ personalizationTime: 0 });
  }

  public async startWeekTiming(isAdBlockSituation?: boolean): Promise<void> {
    const currentDate = Date.now();
    let delay: number;

    if (isAdBlockSituation) {
      delay = Number(DELAY_WHILE_AD_BLOCKER);
    } else {
      delay = Number(DELAY_BETWEEN_SURVEY);
    }

    const endTime = currentDate + delay;

    await chrome.storage.local.set({ weekEndTime: endTime });
  }

  public async isWeekPassed(): Promise<boolean> {
    const { weekEndTime } = await chrome.storage.local.get('weekEndTime');
    const currentTime = Date.now();

    return currentTime >= weekEndTime;
  }
}