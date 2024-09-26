import { BaseStrategy } from './BaseStrategy';
import { urlErrors } from '../../enums';

export class AmazonStrategy extends BaseStrategy {
  public strategyKey = 'amazonAdPrefs';

  async execute() {
    const alreadyExecuted = sessionStorage.getItem('amazonAdPrefsExecuted');
    if (alreadyExecuted) {
      return this.sendResponseToWorker(true);
    }

    const signInButton = document.querySelector('#a-autoid-0-announce') as HTMLElement;
    if (signInButton) {
      signInButton.click();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const boxes = await this.waitForElements<HTMLInputElement>('[name="optout"]');
    if (!boxes) return this.sendResponseToWorker(false, urlErrors.INVALID_URL);

    this.addBlurEffect();
    const trueBox = Array.from(boxes).find((box) => box.value === '0');

    await new Promise((resolve) => requestAnimationFrame(resolve));

    trueBox?.click();

    const saveButton = document.getElementById('optOutControl') as HTMLElement;
    saveButton?.click();

    sessionStorage.setItem('amazonAdPrefsExecuted', 'true');
  }
}
