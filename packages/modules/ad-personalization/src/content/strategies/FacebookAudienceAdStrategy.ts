import { BaseStrategy } from './BaseStrategy';

export class FacebookAudienceAdStrategy extends BaseStrategy {
  public strategyKey = 'facebookAudienceAds';
  private blurApplied = false;
  private isUrlChecked = false;

  async execute() {
    const processElement = async (el: HTMLElement, isFirstElement: boolean) => {
      if (el) {
        el.click();

        let beforeUnloadListener = () => {
          this.sendResponseToWorker(false, 'Not valid URL.');
        };

        if (!this.isUrlChecked) {
          window.addEventListener('beforeunload', beforeUnloadListener);
          this.isUrlChecked = true;
        }

        await new Promise((resolve) => requestAnimationFrame(resolve));

        const openSettingsButton = await this.waitForElement(
          'a[href^="/ad_preferences/ad_settings/audience_based_advertising"][aria-label="You may have interacted with their website, app or store."], a[href^="/ad_preferences/ad_settings/audience_based_advertising"][aria-label="They uploaded or used a list to reach you."]'
        );

        if (openSettingsButton) window.removeEventListener('beforeunload', beforeUnloadListener);

        if (openSettingsButton.ariaLabel === 'They uploaded or used a list to reach you.') {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const backButtons = await this.waitForElements('[aria-label="Back"]');
          if (backButtons.length > 0) {
            backButtons[backButtons.length - 1].click();
          }
          return;
        }

        openSettingsButton.click();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const darkElements = await this.waitForElements('.__fb-dark-mode.x1n2onr6.xzkaem6');
        darkElements.forEach((darkElement) => (darkElement.style.display = 'none'));

        await new Promise((resolve) => requestAnimationFrame(resolve));
        const toggleAdsButton = await this.waitForElement('[role="listitem"] [role="button"]');

        if (toggleAdsButton && toggleAdsButton.textContent === 'Hide ads') {
          toggleAdsButton.click();
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        await new Promise((resolve) => requestAnimationFrame(resolve));
        const backButtons = await this.waitForElements('[aria-label="Back"]');
        if (backButtons.length > 0) {
          backButtons[backButtons.length - 1].click();
        }

        await new Promise((resolve) => requestAnimationFrame(resolve));
        const secondDarkElements = await this.waitForElements('.__fb-dark-mode.x1n2onr6.xzkaem6');
        secondDarkElements.forEach((darkElement) => (darkElement.style.display = 'none'));

        if (!isFirstElement) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const exitButtons = await this.waitForElements('[aria-label="Back"]');
          if (exitButtons.length > 0) {
            exitButtons[exitButtons.length - 1].click();
          }
        }
      }
    };

    let index = 0;

    while (true) {
      const seeMoreButton = await this.waitForElement('[role="button"] [role="presentation"]');

      if (!this.blurApplied) {
        this.addBlurEffect();
        this.blurApplied = true;
      }

      if (seeMoreButton) seeMoreButton.click();

      await new Promise((resolve) => requestAnimationFrame(resolve));

      const elements = Array.from(
        document.querySelectorAll('[data-visualcompletion="ignore-dynamic"] [role="presentation"]')
      ) as HTMLElement[];

      if (index >= elements.length) break;

      const isFirstElement = index === 0;
      await processElement(elements[index], isFirstElement);

      if (index === elements.length - 1) {
        this.sendResponseToWorker(true);
      }

      index++;
    }
  }
}
