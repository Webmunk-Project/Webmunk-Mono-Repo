import { IStrategy } from './strategies/BaseStrategy';
import * as Strategies from './strategies';

export class StrategyFactory {
  private strategiesMap: Map<string, IStrategy> = new Map();

  constructor() {
    this.createAllStrategies();
  }

  private createAllStrategies(): void {
    Object.values(Strategies).forEach((Strategy) => {
      const strategyInstance = new Strategy();
      this.strategiesMap.set(strategyInstance.strategyKey, strategyInstance);
    });
  }


  public getStrategiesMap(): Map<string, IStrategy> {
    return this.strategiesMap;
  }
}
