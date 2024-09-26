// dont remove next line, all webmunk modules use messenger utility
// @ts-ignore
import { messenger } from "@webmunk/utils";
import { RudderStack } from './Rudderstack';

// this is where you could import your webmunk modules worker scripts
import "@webmunk/extension-ads/worker";
import "@webmunk/cookies-scraper/worker";
import "@webmunk/ad-personalization/worker";

interface Survey {
  name: string;
  url: string;
}

interface SurveyData {
  name: string;
  url: string;
}

enum events {
  SURVEY_COMPLETED = 'survey_completed',
};

export class Worker {
  private surveys: Survey[] = [];
  private completedSurveys: string[] = [];
  private rudderStack: RudderStack;

  constructor() {
    this.rudderStack = new RudderStack();
  }

  public async initialize(): Promise<void> {
    messenger.addReceiver('appMgr', this);
    messenger.addModuleListener('ads-scraper', this.onModuleEvent.bind(this));
    messenger.addModuleListener('cookies-scraper', this.onModuleEvent.bind(this));
    messenger.addModuleListener('ad-personalization', this.onModuleEvent.bind(this));
    chrome.tabs.onUpdated.addListener(this.surveyCompleteListener.bind(this));

    await this.initSurveys();
  }

  private async onModuleEvent(event: string, data: any): Promise<void> {
    await this.rudderStack.track(event, data);
  }

  private async initSurveys(): Promise<void>  {
    const result = await chrome.storage.local.get('completedSurveys');
    this.completedSurveys = result.completedSurveys || [];
    await this.loadSurveys();
  }

  private async loadSurveys(): Promise<void> {
    const response = await fetch(chrome.runtime.getURL('data/surveys.json'));
    const data: SurveyData[] = await response.json();
    const newSurveys: Survey[] = data.map((item) => ({
      name: item.name,
      url: item.url
    }));

    newSurveys.forEach((survey) => {
      if (!this.surveys.some((existingSurvey) => existingSurvey.url === survey.url) && !this.completedSurveys.includes(survey.url)) {
        this.surveys.push(survey);
      }
    });

    await chrome.storage.local.set({ surveys: this.surveys });
  }

  async surveyCompleteListener(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): Promise<void> {
    const runtimeUrl = `chrome-extension://${chrome.runtime.id}/pages/survey-completed.html`;

    if (changeInfo.status !== 'complete' || tab.url !== runtimeUrl) {
      return;
    }

    const openerTabId = tab.openerTabId;
    const openerTabUrl = openerTabId ? (await chrome.tabs.get(openerTabId)).url : undefined;

    if (openerTabUrl && this.surveys.some((survey) => openerTabUrl === survey.url)) {
      await chrome.tabs.remove(tab.openerTabId!);

      if (this.completedSurveys.includes(openerTabUrl)) {
        return;
      }

      this.completedSurveys.push(openerTabUrl);
      this.surveys = this.surveys.filter((survey) => survey.url !== openerTabUrl);

      await chrome.storage.local.set({ surveys: this.surveys, completedSurveys: this.completedSurveys });

      console.log(`The survey ${openerTabUrl} was completed`);
      await this.rudderStack.track(events.SURVEY_COMPLETED, { surveyUrl: openerTabUrl });
    }
  }
};