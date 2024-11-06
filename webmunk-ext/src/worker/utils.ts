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
