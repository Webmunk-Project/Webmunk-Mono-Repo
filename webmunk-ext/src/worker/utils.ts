import { UrlParameters } from '../enums';

export const isNeedToDisableSurveyLoading = async (): Promise<boolean> => {
  const personalizationConfigsResult = await chrome.storage.local.get('personalizationConfigs');
  const personalizationConfigs = personalizationConfigsResult.personalizationConfigs || {};
  const specifiedItem = personalizationConfigs[UrlParameters.AD_BLOCKER];

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
