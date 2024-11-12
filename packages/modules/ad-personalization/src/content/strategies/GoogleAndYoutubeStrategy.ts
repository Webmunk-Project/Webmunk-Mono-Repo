import { PersonalizationData } from '../../types';
import { BaseStrategy } from './BaseStrategy';

export class GoogleAndYoutubeStrategy extends BaseStrategy {
  public strategyKey = 'gyta';

  async execute(data: PersonalizationData) {
    const { value, url, isNeedToLogin } = data;
    let currentValue = value ?? false;

    if (!window.location.href.startsWith(url!) && !isNeedToLogin) return this.sendResponseToWorker(null);

    if (value === undefined) {
      const offButton = document.querySelector('[aria-label="Turn off"]');
      const onButton = document.querySelector('[aria-label="Turn on"]');

      if (offButton) {
        currentValue = true;
      } else if (onButton) {
        currentValue = false;
      }

      this.addBlurEffect();
      return this.sendResponseToWorker({ currentValue });
    }

    if (value) {
      const offButton = document.querySelector('[aria-label="Turn off"]');
      if (offButton) {
        this.addBlurEffect();
        return this.sendResponseToWorker({ currentValue, initialValue: value });
      }

      const onButton = document.querySelector('[aria-label="Turn on"]') as HTMLElement;
      if (onButton) this.addBlurEffect();
      onButton.click();

      const saveButton = document.querySelector('[jsname="Lnwj0b"]') as HTMLElement;
      saveButton.click();

      this.sendResponseToWorker({ currentValue, initialValue: !value });
    } else {
      const onButton = document.querySelector('[aria-label="Turn on"]');
      if (onButton) {
        this.addBlurEffect();
        return this.sendResponseToWorker({ currentValue, initialValue: value });
      }

      const offButton = document.querySelector('[aria-label="Turn off"]') as HTMLElement;
      if (offButton) this.addBlurEffect();
      offButton.click();

      const saveButton = document.querySelector('[jsname="mXJpKc"]') as HTMLElement;
      saveButton.click();

      this.sendResponseToWorker({ currentValue, initialValue: !value });
    }
  }
}
