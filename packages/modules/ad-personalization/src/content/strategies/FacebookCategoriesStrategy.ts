import { BaseStrategy } from './BaseStrategy';
import { ErrorMessages } from '../../ErrorMessages';

export class FacebookCategoriesStrategy extends BaseStrategy {
  public strategyKey = 'facebookCategories';

  async execute() {
    const checkboxes = await this.waitForElements('input[type="checkbox"]');

    if(!checkboxes) this.sendResponseToWorker(false, ErrorMessages.INVALID_URL);

    this.addBlurEffect();

    checkboxes?.forEach((box) => {
      if (box.getAttribute('aria-checked') === 'false') return;
      box.click();
    });

    this.sendResponseToWorker(true);
  }
}
