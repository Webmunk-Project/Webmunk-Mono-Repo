import { BaseStrategy } from '../BaseStrategy';

export class FacebookCategoriesStrategy extends BaseStrategy {
  public strategyKey = 'facebookCategories';

  async execute() {
    const checkboxes = await this.waitForElements('input[type="checkbox"]');
    this.addBlurEffect();

    checkboxes.forEach((box) => {
      if (box.getAttribute('aria-checked') === 'false') return;
      box.click();
    });

    this.sendResponseToService(true);
  }
}
