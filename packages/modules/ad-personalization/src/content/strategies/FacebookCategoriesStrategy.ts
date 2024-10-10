import { BaseStrategy } from './BaseStrategy';
import { ErrorMessages } from '../../ErrorMessages';

export class FacebookCategoriesStrategy extends BaseStrategy {
  public strategyKey = 'facebookCategories';

  async execute(value: boolean) {
    const checkboxes = await this.waitForElements('input[type="checkbox"]');

    if (!checkboxes) {
      return this.sendResponseToWorker(null, ErrorMessages.INVALID_URL);
    }

    this.addBlurEffect();

    let hasClicked = false;

    checkboxes.forEach((box) => {
      const isChecked = box.getAttribute('aria-checked') === 'true';

      if (value) {
        if (isChecked) return;
      } else {
        if (!isChecked) return;
      }

      box.click();
      hasClicked = true;
    });

    const initialValue = hasClicked ? !value : value;

    this.sendResponseToWorker({ currentValue: value, initialValue });
  }
}
