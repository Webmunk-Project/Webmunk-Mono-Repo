import { Analytics } from "@rudderstack/analytics-js-service-worker";

export class RudderStack {
  static events = Object.freeze({
    ADS_DETECTED: 'ads_detected',
  });

  constructor() {
      this._client = new Analytics('2hv3OHj4joAaarruwt337mRuFhx','https://unibrixdmyrfcl.dataplane.rudderstack.com');               // Number of requests allowed in the interval
  }

  track(event, properties) {
    if (!this._isSupportedEvent(event)) {
      throw new Error('Unsupported event!');
    }

    this._client.track({
      event,
      properties,
      userId: '12345'
    });
    this._client.flush();
  }

  _isSupportedEvent(event) {
    return Object.values(RudderStack.events).includes(event);
  }
}
