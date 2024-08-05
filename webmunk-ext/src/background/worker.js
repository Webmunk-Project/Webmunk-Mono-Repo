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

    chrome.storage.local.get('completedSurveys', (result) => {
      this.completedSurveys = result.completedSurveys || [];
      this.loadSurveys();
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete") {
        this.surveyCompleteListener(tabId, tab);
      }
    });
  },

  loadSurveys() {
    fetch(chrome.runtime.getURL("../surveys.json"))
      .then((response) => response.json())
      .then((data) => {
        const newSurveys = data.map((item) => ({
          name: item.name,
          url: item.url
        }));

        newSurveys.forEach((survey) => {
          if (!this.surveys.some((existingSurvey) => existingSurvey.url === survey.url) && !this.completedSurveys.includes(survey.url)) {
            this.surveys.push(survey);
          }
        });

        chrome.storage.local.set({ surveys: this.surveys });
      })
  },

  surveyCompleteListener(tabId, tab) {
    const runtimeUrl = `chrome-extension://${chrome.runtime.id}/pages/survey-completed.html`;

    chrome.storage.local.get("prevUrl", (result) => {
      const prevUrl = result.prevUrl || null;

      if (tab.url === runtimeUrl && prevUrl && this.surveys.some((survey) => prevUrl.includes(survey.url))) {
        if (!this.completedSurveys.includes(prevUrl)) {
          this.completedSurveys.push(prevUrl);
        }

        this.surveys = this.surveys.filter((survey) => survey.url !== prevUrl);
        chrome.storage.local.set({ surveys: this.surveys, completedSurveys: this.completedSurveys });
        console.log(`The survey ${prevUrl} was completed`)
      }

      chrome.storage.local.set({ prevUrl: tab.url });
    });
  },
};

appMgr.initialize();