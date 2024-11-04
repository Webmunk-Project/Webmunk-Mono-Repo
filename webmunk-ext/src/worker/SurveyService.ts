import { SurveyItem } from '../types';
import { ConfigService } from './ConfigService';
import { WEBMUNK_URL } from '../config';
import { NotificationService } from './NotificationService';
import { NotificationText } from '../enums';
import { DELAY_BETWEEN_SURVEY } from '../config';
import { RudderStack } from './Rudderstack';

enum events {
  SURVEY_COMPLETED = 'survey_completed',
}

export class SurveyService {
  private surveys: SurveyItem[] = [];
  private completedSurveys: SurveyItem[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly rudderStack: RudderStack
    ) {
    chrome.tabs.onUpdated.addListener(this.surveyCompleteListener.bind(this));
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

  public async initSurveysIfNeeded(): Promise<void> {
    const { identifier } = await chrome.storage.local.get('identifier');
    if (!identifier) return;

    const isWeekPassed = await this.isWeekPassed();
    if (!isWeekPassed) return;

    const tabId = await this.getActiveTabId();
    if (!tabId) return;

    const initialSurveyCount = this.surveys.length;

    await this.loadSurveys();

    if (this.surveys.length > initialSurveyCount) {
      await this.startWeekTiming();
      await this.notificationService.showNotification(tabId, NotificationText.FILL_OUT);
    }
  }

  public async initSurveysIfExists(): Promise<void> {
    const existingSurveys = await chrome.storage.local.get('surveys');
    this.surveys = existingSurveys.surveys || [];

    const existingCompletedSurveys = await chrome.storage.local.get('completedSurveys');
    this.completedSurveys = existingCompletedSurveys.completedSurveys || [];
  }

  private async loadSurveys(): Promise<void> {
    const { identifier, lastSurveyIndex = -1 } = await chrome.storage.local.get(['identifier', 'lastSurveyIndex']);
    const prolificId = identifier?.prolificId;

    const jsonSurveys = await this.configService.getConfigByKey('surveys');
    const surveys: SurveyItem[] = JSON.parse(jsonSurveys);

    const nextSurveyIndex = lastSurveyIndex + 1;

    if (nextSurveyIndex < surveys.length) {
      const surveyData = surveys[nextSurveyIndex];
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

  public async surveyCompleteListener(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): Promise<void> {
    const baseUrl = new URL(WEBMUNK_URL).origin;

    if (changeInfo.status !== 'complete' || !tab.url?.startsWith(baseUrl)) {
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

      console.log(`The survey ${openerTabUrl} was completed`);
      await this.startWeekTiming();
      await this.rudderStack.track(events.SURVEY_COMPLETED, { surveyUrl: openerTabUrl });
    }
  }

  public async startWeekTiming(): Promise<void> {
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
}