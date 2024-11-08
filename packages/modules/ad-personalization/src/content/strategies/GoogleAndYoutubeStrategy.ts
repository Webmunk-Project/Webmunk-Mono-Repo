import { PersonalizationData } from '../../types';
import { BaseStrategy } from './BaseStrategy';

export class GoogleAndYoutubeStrategy extends BaseStrategy {
  public strategyKey = 'gyta';

  async execute(data: PersonalizationData) {
    const { value, url, isNeedToLogin } = data;

    if (!window.location.href.startsWith(url!) && !isNeedToLogin) return this.sendResponseToWorker(null);

    if (value) {
      const offButton = document.querySelector('[aria-label="Turn off"]');
      if (offButton) {
        this.addBlurEffect();
        return this.sendResponseToWorker({ currentValue: value, initialValue: value });
      }

      const onButton = document.querySelector('[aria-label="Turn on"]') as HTMLElement;
      if (onButton) this.addBlurEffect();
      onButton.click();

      const saveButton = document.querySelector('[jsname="Lnwj0b"]') as HTMLElement;
      saveButton.click();

      this.sendResponseToWorker({ currentValue: value, initialValue: !value });
    } else {
      const onButton = document.querySelector('[aria-label="Turn on"]');
      if (onButton) {
        this.addBlurEffect();
        return this.sendResponseToWorker({ currentValue: value, initialValue: value });
      }

      const offButton = document.querySelector('[aria-label="Turn off"]') as HTMLElement;
      if (offButton) this.addBlurEffect();
      offButton.click();

      const saveButton = document.querySelector('[jsname="mXJpKc"]') as HTMLElement;
      saveButton.click();

      this.sendResponseToWorker({ currentValue: value, initialValue: !value });
    }
  }
}
