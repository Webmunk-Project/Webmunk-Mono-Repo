import { BaseStrategy } from './BaseStrategy';
import * as Strategies from './strategies/Strategies';

export class StrategyFactory {
  private strategiesMap: Map<string, BaseStrategy> = new Map();

  constructor() {
    this.createAllStrategies();
  }

  private createAllStrategies(): void {
    Object.values(Strategies).forEach((Strategy) => {
        const strategyInstance = new Strategy();
        this.strategiesMap.set(strategyInstance.strategyKey, strategyInstance);
    })
  }

  public getStrategiesMap(): Map<string, BaseStrategy> {
    return this.strategiesMap;
  }
}
