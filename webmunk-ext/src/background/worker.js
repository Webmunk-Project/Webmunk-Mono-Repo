// dont remove next line, all webmunk modules use messenger utility
import { messenger } from "@webmunk/utils";
import { RudderStack } from './rudderstack';
import { SettingsManagementService } from "./SettingsManagementService";

// this is where you could import your webmunk modules worker scripts
import "@webmunk/extension-ads/worker.js";
import "@webmunk/cookies-scraper/worker";

const events = Object.freeze({
  SURVEY_COMPLETED: 'survey_completed',
});

const appMgr =  {
  surveys: [],
  completedSurveys: [],
  rudderStack: new RudderStack(),
  settingsManagementService: new SettingsManagementService(),
  async initialize(){
    messenger.addReceiver('appMgr', this);
    messenger.addModuleListener('ads-scraper', this.onModuleEvent.bind(this));
    messenger.addModuleListener('cookies-scraper', this.onModuleEvent.bind(this));
    chrome.tabs.onUpdated.addListener(this.surveyCompleteListener.bind(this));
    chrome.runtime.onMessage.addListener(this.onPopupMessage.bind(this));

    await this.initSurveys();
    await this.initSettings();
  },
  async onModuleEvent(event, data) {
    await this.rudderStack.track(event, data);
  },
  async initSurveys() {
    const result = await chrome.storage.local.get('completedSurveys');
    this.completedSurveys = result.completedSurveys || [];
    await this.loadSurveys();
  },
  async onPopupMessage(request, sender, sendResponse) {
    if (request.action === 'webmunkExt.popup.settingsClicked') {
      const { response, tabId } = await this.settingsManagementService.send(request.url);
      if (!response) return;

      setTimeout(async () => {
        await chrome.tabs.remove(tabId);

        const checkedSettingsResult = await chrome.storage.local.get('checkedSettings');
        const checkedSettings = checkedSettingsResult.checkedSettings || {};

        checkedSettings[request.url] = response;

        await chrome.storage.local.set({ checkedSettings });
      }, 500);
    }
  },
  async initSettings() {
    const result = await this.settingsManagementService.loadSettingsManagement();
    await chrome.storage.local.set({ settings: result });
  },
  async loadSurveys() {
    const response = await fetch(chrome.runtime.getURL('data/surveys.json'));
    const data = await response.json();
    const newSurveys = data.map((item) => ({
      name: item.name,
      url: item.url
    }));

    newSurveys.forEach((survey) => {
      if (!this.surveys.some((existingSurvey) => existingSurvey.url === survey.url) && !this.completedSurveys.includes(survey.url)) {
        this.surveys.push(survey);
      }
    });

    await chrome.storage.local.set({ surveys: this.surveys });
  },
  async surveyCompleteListener(tabId, changeInfo, tab) {
    const runtimeUrl = `chrome-extension://${chrome.runtime.id}/pages/survey-completed.html`;

    if (changeInfo.status !== 'complete' || tab.url !== runtimeUrl) {
      return;
    }

    const openerTabUrl = (await chrome.tabs.get(tab.openerTabId)).url;

    if (openerTabUrl && this.surveys.some((survey) => openerTabUrl === survey.url)) {
      await chrome.tabs.remove(tab.openerTabId);

      if (this.completedSurveys.includes(openerTabUrl)) {
        return;
      }

      this.completedSurveys.push(openerTabUrl);
      this.surveys = this.surveys.filter((survey) => survey.url !== openerTabUrl);

      await chrome.storage.local.set({ surveys: this.surveys, completedSurveys: this.completedSurveys });

      console.log(`The survey ${openerTabUrl} was completed`);
      await this.rudderStack.track(events.SURVEY_COMPLETED, { surveyUrl: openerTabUrl });
    }
  },
};

appMgr.initialize();
