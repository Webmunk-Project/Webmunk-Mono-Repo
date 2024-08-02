// dont remove next line, all webmunk modules use messenger utility
import { messenger } from "@webmunk/utils"
import { wmSessionMgr } from '@webmunk/utils';

// this is where you could import your webmunk modules worker scripts
import "@webmunk/extension-ads/worker.js";
import "@webmunk/cookies-scrapper-module/worker";

const appMgr =  {
  initialize:function(){
    messenger?.addReceiver('appMgr', this);
    this.isSurveyCompletedAfterSurvey();
  },

  isSurveyCompletedAfterSurvey() {
    const runtimeUrl = `chrome-extension://${chrome.runtime.id}/pages/survey-completed.html`;

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url.includes('hbs.qualtrics.com/jfe/form/SV')) {
        const urlParams = new URL(tab.url).searchParams;
        const userId = urlParams.get('userId');

        if (userId) {
          chrome.storage.local.set({ openedSurveyID: userId });
        }
      }

      if (changeInfo.status === 'complete' && tab.url === runtimeUrl) {
        chrome.storage.local.get('openedSurveyID', (result) => {
          if (result.openedSurveyID) {
            chrome.storage.local.set({ surveyCompleted: true });
          }
        });
      }
    });
  }
};

appMgr.initialize();