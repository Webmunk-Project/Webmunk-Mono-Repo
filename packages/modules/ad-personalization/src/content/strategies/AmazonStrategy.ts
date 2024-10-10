import { BaseStrategy } from './BaseStrategy';
import { ErrorMessages } from '../../ErrorMessages';

export class AmazonStrategy extends BaseStrategy {
  public strategyKey = 'amazonAdPrefs';

  async execute(value: boolean) {
    const signInButton = document.querySelector('#a-autoid-0-announce') as HTMLElement;
    if (signInButton) {
      signInButton.click();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const boxes = await this.waitForElements<HTMLInputElement>('[name="optout"]');

    if (!boxes) return this.sendResponseToWorker(null, ErrorMessages.INVALID_URL);

    this.addBlurEffect();

    let specifiedBox;

    if (value) {
      specifiedBox = Array.from(boxes).find((box) => box.value === '0');
    } else {
      specifiedBox = Array.from(boxes).find((box) => box.value === '1');
    }

    if (specifiedBox?.checked) return this.sendResponseToWorker({ currentValue: value, initialValue: !value });

    await new Promise((resolve) => requestAnimationFrame(resolve));

    specifiedBox?.click();

    const saveButton = document.getElementById('optOutControl') as HTMLElement;
    saveButton?.click();

    const pageReloaded = await this.waitForPageReload();

    if (pageReloaded) return this.sendResponseToWorker({ currentValue: value, initialValue: !value });
  }
}
