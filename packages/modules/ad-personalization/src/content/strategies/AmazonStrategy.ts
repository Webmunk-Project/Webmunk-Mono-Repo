import { BaseStrategy } from './BaseStrategy';
import { ErrorMessages } from '../../ErrorMessages';

export class AmazonStrategy extends BaseStrategy {
  public strategyKey = 'amazonAdPrefs';

  async execute() {
    const signInButton = document.querySelector('#a-autoid-0-announce') as HTMLElement;
    if (signInButton) {
      signInButton.click();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const boxes = await this.waitForElements<HTMLInputElement>('[name="optout"]');

    if (!boxes) return this.sendResponseToWorker(false, ErrorMessages.INVALID_URL);

    this.addBlurEffect();
    const trueBox = Array.from(boxes).find((box) => box.value === '0');

    if (trueBox?.checked) return this.sendResponseToWorker(true);

    await new Promise((resolve) => requestAnimationFrame(resolve));

    trueBox?.click();

    const saveButton = document.getElementById('optOutControl') as HTMLElement;
    saveButton?.click();

    const pageReloaded = await this.waitForPageReload();

    if (pageReloaded) return this.sendResponseToWorker(true);
  }
}
