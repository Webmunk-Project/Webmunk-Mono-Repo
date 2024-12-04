import { PersonalizationData } from '../../types';
import { BaseStrategy } from './BaseStrategy';
import { ErrorMessages } from '../../ErrorMessages';

export class FacebookActivityStrategy extends BaseStrategy {
  public strategyKey = 'fad';

  async execute(data: PersonalizationData) {
    const { value, url, isNeedToLogin } = data;
    let currentValue = value ?? false;

    if (!window.location.href.startsWith(url!) && !isNeedToLogin) return this.sendResponseToWorker(null);

    if (!window.location.href.startsWith('https://www.facebook.com/login') && !window.location.href.startsWith(url!)) {
      if (window.document.title !== 'Facebook - log in or sign up') {
        window.location.href = url!;
      }
    }

    const reviewButton = await this.waitForElement('.x1lliihq.x193iq5w.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft');
    this.addBlurEffect();
    reviewButton.click();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    let specifiedBox;

    if (value === undefined) {
      specifiedBox = document.querySelector('[name="radio1"]:checked, [name="radio2"]:checked') as HTMLInputElement;
      currentValue = specifiedBox.name === 'radio1';

      return this.sendResponseToWorker({ currentValue });
    } else {
      specifiedBox = document.querySelector(`[name="${value ? 'radio1' : 'radio2'}"]`) as HTMLInputElement;
    }

    if (!specifiedBox) return this.sendResponseToWorker(null, ErrorMessages.INVALID_URL);

    if (specifiedBox?.checked) return this.sendResponseToWorker({ currentValue, initialValue: value });

    await new Promise((resolve) => requestAnimationFrame(resolve));
    specifiedBox.click();

    const buttons = document.querySelectorAll('.x1lliihq.x193iq5w.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft');
    const confirmButton = buttons[buttons.length - 1] as HTMLElement;
    confirmButton.click();

    this.sendResponseToWorker({ currentValue, initialValue: !value });
  }
}