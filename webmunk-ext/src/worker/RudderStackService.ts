import { Analytics } from '@rudderstack/analytics-js-service-worker';
import { RUDDERSTACK_DATA_PLANE, RUDDERSTACK_WRITE_KEY } from '../config';
import { FirebaseAppService } from './FirebaseAppService';

export class RudderStackService {
  private client: Analytics;

  constructor(private readonly firebaseAppService: FirebaseAppService) {
    this.client = new Analytics(RUDDERSTACK_WRITE_KEY, RUDDERSTACK_DATA_PLANE);
  }

  async track(event: string, properties: any): Promise<void> {
    const user = await this.firebaseAppService.getUser();

    if (!user) {
      console.error('There is no user identifier. Please register.');
      return;
    }

    if (!user.active) {
      console.error('User is not active.');
      return;
    }

    return new Promise((resolve, reject) => {
      this.client.track({
        event,
        properties,
        userId: user.uid,
      }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  async flush(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.flush((err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }
}
