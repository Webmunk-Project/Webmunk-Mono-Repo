import { IStrategy } from './strategies/BaseStrategy';
import { StrategyFactory } from './StrategyFactory';

export class AdPersonalizationContent {
  private strategyFactory: StrategyFactory;
  private strategiesMap: Map<string, IStrategy>;

  constructor() {
    this.strategyFactory = new StrategyFactory();
    this.strategiesMap = this.strategyFactory.getStrategiesMap();
    this.initialize();
  };

  public initialize(): void {
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  };

  private handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): void {
    if (message.action === 'adsPersonalization.strategies.settingsRequest') {
      this.handleKey(message.key);
    }
  };

  private handleKey(key: string): void {
    const strategy = this.strategiesMap.get(key);

    if (strategy) strategy.execute();
  };
}