import { UrlParameters } from '../enums';

// if ab(ad blocker) parameter is true, then we disable the loading of all surveys except the first one
export const isNeedToDisableSurveyLoading = async (): Promise<boolean> => {
  const personalizationConfigsResult = await chrome.storage.local.get('personalizationConfigs');
  const personalizationConfigs = personalizationConfigsResult.personalizationConfigs || {};
  const specifiedItem = personalizationConfigs[UrlParameters.AD_BLOCKER] ?? false;

  if (specifiedItem) return true;

  return false;
}

export const getActiveTabId = async (): Promise<number> => {
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
};
