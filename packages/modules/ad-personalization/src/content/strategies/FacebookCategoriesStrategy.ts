import { BaseStrategy } from './BaseStrategy';
import { ErrorMessages } from '../../ErrorMessages';

export class FacebookCategoriesStrategy extends BaseStrategy {
  public strategyKey = 'facebookCategories';

  async execute(value: boolean) {
    const checkboxes = await this.waitForElements('input[type="checkbox"]');

    if (!checkboxes) this.sendResponseToWorker(false, ErrorMessages.INVALID_URL);

    this.addBlurEffect();

    checkboxes?.forEach((box) => {
      if (value) {
        if (box.getAttribute('aria-checked') === 'true') return;
      } else {
        if (box.getAttribute('aria-checked') === 'false') return;
      }

      box.click();
    });

    this.sendResponseToWorker(value);
  }
}
