import { FirebaseOptions } from '@firebase/app';
import { getRemoteConfig, fetchAndActivate, getAll } from 'firebase/remote-config';
import { FirebaseAppService } from './FirebaseAppService';
import { FirebaseConfig, convertConfigValuesToPrimitives } from './FirebaseRemoteConfig';

export type Config = FirebaseConfig & FirebaseOptions;

export class ConfigService {
  private config: Config | null = null;
  private fetchPromise: Promise<void> | null = null;
  private fetchTimestamp: number | null = null;

  constructor(private readonly firebaseAppService: FirebaseAppService) {}

  async getConfig(): Promise<Config> {
    if (this.fetchPromise) {
      await this.fetchPromise;
    } else if (!this.config || this.refreshNeeded()) {
      await this.loadConfig();
    }

    return this.config!;
  }

  async getConfigByKey(key: keyof Config): Promise<any | undefined> {
    const config = await this.getConfig() || {};

    return config[key];
  }

  private async loadConfig(): Promise<void> {
    const fetchPromise: Promise<void> = new Promise(async (resolve, reject) => {
      try {
        const firebaseConfig = getRemoteConfig(this.firebaseAppService.getFirebaseApp());
        firebaseConfig.settings.minimumFetchIntervalMillis = 900000;
        await fetchAndActivate(firebaseConfig);

        this.config = Object.assign(
          convertConfigValuesToPrimitives(getAll(firebaseConfig)),
          this.firebaseAppService.getConfig(),
        );
        this.fetchTimestamp = Date.now();
        resolve();
      } catch (e: any) {
        this.fetchPromise = null;
        reject(e);
      }
    });

    this.fetchPromise = fetchPromise;
    return fetchPromise;
  }

  private refreshNeeded() {
    return this.fetchTimestamp ? (Date.now() - this.fetchTimestamp) > 10000 : true
  }
}
