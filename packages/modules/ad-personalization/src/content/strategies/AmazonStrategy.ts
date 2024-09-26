import { BaseStrategy } from './BaseStrategy';

export class AmazonStrategy extends BaseStrategy {
  public strategyKey = 'amazonAdPrefs';

  async execute() {
    const signInButton = document.querySelector('#a-autoid-0-announce') as HTMLElement;
    if (signInButton) {
      signInButton.click();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const boxes = await this.waitForElements<HTMLInputElement>('[name="optout"]');
    if(!boxes) return this.sendResponseToWorker(false, 'No valid URLs.');
    this.addBlurEffect();
    const trueBox = Array.from(boxes).find((box) => box.value === '0');

    await new Promise((resolve) => requestAnimationFrame(resolve));

    if (trueBox?.checked) return this.sendResponseToWorker(true);

    trueBox?.click();

    const saveButton = document.getElementById('optOutControl');
    saveButton?.click();

    this.sendResponseToWorker(true);
  }
}
