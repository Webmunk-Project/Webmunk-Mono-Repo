import { Analytics } from '@rudderstack/analytics-js-service-worker';
import { RUDDERSTACK_DATA_PLANE, RUDDERSTACK_WRITE_KEY } from '../config';

export class RudderStack {
  constructor() {
      this._client = new Analytics(RUDDERSTACK_WRITE_KEY, RUDDERSTACK_DATA_PLANE);
  }

  async track(event, properties) {
    const userId = await this._getUserIdentifier();

    if (!userId) {
      console.error('There is no user identifier. Please register.');
      return;
    }

    return new Promise((resolve, reject) => {
      this._client.track({
        event,
        properties,
        userId,
      }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  async flush() {
    return new Promise((resolve, reject) => {
      this._client.flush((err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  async _getUserIdentifier() {
    const result = await chrome.storage.local.get('identifier');
    return result.identifier;
  }
}
