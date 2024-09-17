import { BaseStrategy } from './BaseStrategy';

export class GoogleAndYoutubeStrategy extends BaseStrategy {
  public strategyKey = 'googleYouTubeAds';

  async execute() {
    const offButton = document.querySelector('[aria-label="Turn off"]');
    if (offButton) {
      this.addBlurEffect();
      return this.sendResponseToService(true);
    }

    const onButton = document.querySelector('[aria-label="Turn on"]') as HTMLElement;
    if (onButton) this.addBlurEffect();
    onButton.click();

    const saveButton = document.querySelector('[jsname="Lnwj0b"]') as HTMLElement;
    saveButton.click();

    this.sendResponseToService(true);
  }
}
