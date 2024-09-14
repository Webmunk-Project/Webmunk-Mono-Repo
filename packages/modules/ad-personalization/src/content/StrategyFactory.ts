import { BaseStrategy } from './strategies/BaseStrategy';
import * as Strategies from './strategies';

export class StrategyFactory {
  private strategiesMap: Map<string, BaseStrategy> = new Map();

  constructor() {
    this.createAllStrategies();
  }

  private createAllStrategies(): void {
    Object.values(Strategies).forEach((Strategy) => {
      this.strategiesMap.set(new Strategy().strategyKey, new Strategy());
    })
  }

  public getStrategiesMap(): Map<string, BaseStrategy> {
    return this.strategiesMap;
  }
}
