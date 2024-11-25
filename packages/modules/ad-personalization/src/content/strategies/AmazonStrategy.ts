import { PersonalizationData } from '../../types';
import { BaseStrategy } from './BaseStrategy';
import { ErrorMessages } from '../../ErrorMessages';

export class AmazonStrategy extends BaseStrategy {
  public strategyKey = 'aap';

  async execute(data: PersonalizationData) {
    const { value, isNeedToLogin } = data;
    let currentValue = value ?? false;

    const signInButton = document.querySelector('#a-autoid-0-announce') as HTMLElement;

    if (signInButton && !isNeedToLogin) return this.sendResponseToWorker(null);

    if (signInButton && isNeedToLogin) {
      signInButton.click();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const boxes = await this.waitForElements<HTMLInputElement>('[name="optout"]', true);

    this.addBlurEffect();

    let specifiedBox;

    if (value === undefined) {
      specifiedBox = Array.from(boxes!).find((box) => box.checked);
      currentValue = specifiedBox?.value === '0';

      return this.sendResponseToWorker({ currentValue })
    } else {
      specifiedBox = Array.from(boxes!).find((box) => box.value === (value ? '0' : '1'));
    }

    if (!specifiedBox) return this.sendResponseToWorker(null, ErrorMessages.INVALID_URL);

    if (specifiedBox?.checked) return this.sendResponseToWorker({ currentValue, initialValue: !value });

    await new Promise((resolve) => requestAnimationFrame(resolve));

    specifiedBox?.click();

    const saveButton = document.getElementById('optOutControl') as HTMLElement;
    saveButton?.click();

    const pageReloaded = await this.waitForPageReload();

    if (pageReloaded) return this.sendResponseToWorker({ currentValue, initialValue: !value });
  }
}
