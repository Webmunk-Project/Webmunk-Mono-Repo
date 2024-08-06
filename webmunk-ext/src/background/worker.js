// dont remove next line, all webmunk modules use messenger utility
import { messenger } from "@webmunk/utils"
import { wmSessionMgr } from '@webmunk/utils';

// this is where you could import your webmunk modules worker scripts
import "@webmunk/extension-ads/worker.js";
import "@webmunk/cookies-scrapper-module/worker";

const appMgr = {
  surveys: [],
  completedSurveys: [],

  initialize: async function () {
    messenger?.addReceiver("appMgr", this);

    await this.initSurveys();

    chrome.tabs.onUpdated.addListener(this.surveyCompleteListener.bind(this));
  },

  async initSurveys() {
      const result = await chrome.storage.local.get('completedSurveys');
      this.completedSurveys = result.completedSurveys || [];
      await this.loadSurveys();
  },

  async loadSurveys() {
    const response = await fetch(chrome.runtime.getURL('../surveys.json'));
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
    if (changeInfo.status === "complete") {
      const runtimeUrl = `chrome-extension://${chrome.runtime.id}/pages/survey-completed.html`;

      const result = await chrome.storage.local.get("prevUrl");
      const prevUrl = result.prevUrl || null;

      if (tab.url === runtimeUrl && prevUrl && this.surveys.some((survey) => prevUrl.includes(survey.url))) {
        if (!this.completedSurveys.includes(prevUrl)) {
          this.completedSurveys.push(prevUrl);
        }

        this.surveys = this.surveys.filter((survey) => survey.url !== prevUrl);

        await chrome.storage.local.set({ surveys: this.surveys, completedSurveys: this.completedSurveys });
        console.log(`The survey ${prevUrl} was completed`);
      }

      await chrome.storage.local.set({ prevUrl: tab.url });
    }
  },
};

appMgr.initialize();