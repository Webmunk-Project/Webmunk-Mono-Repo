import { BaseStrategy } from './BaseStrategy';
import { ErrorMessages } from '../../ErrorMessages';

export class FacebookActivityStrategy extends BaseStrategy {
  public strategyKey = 'facebookActivityData';

  async execute() {
    const reviewButton = await this.waitForElement('.x1lliihq.x193iq5w.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft');
    this.addBlurEffect();
    reviewButton.click();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    const trueBox = document.querySelector('[name="radio1"]') as HTMLInputElement;

    if (!trueBox) this.sendResponseToWorker(false, ErrorMessages.INVALID_URL);

    if (trueBox.checked) return this.sendResponseToWorker(true);

    await new Promise((resolve) => requestAnimationFrame(resolve));
    trueBox.click();

    const buttons = document.querySelectorAll('.x1lliihq.x193iq5w.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft');
    const confirmButton = buttons[buttons.length - 1] as HTMLElement;
    confirmButton.click();

    this.sendResponseToWorker(true);
  }
}
