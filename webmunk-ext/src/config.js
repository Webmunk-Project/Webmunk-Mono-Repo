export const WEBMUNK_URL = process.env?.WEBMUNK_URL;
export const RUDDERSTACK_WRITE_KEY = process.env?.RUDDERSTACK_WRITE_KEY;
export const RUDDERSTACK_DATA_PLANE = process.env?.RUDDERSTACK_DATA_PLANE;
export const FIREBASE_CONFIG = {
  apiKey: process.env?.FIREBASE_API_KEY,
  authDomain: `${process.env?.FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: process.env?.FIREBASE_PROJECT_ID,
  storageBucket: `${process.env?.FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: process.env?.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env?.FIREBASE_APP_ID,
};
// 1 week
export const DELAY_BETWEEN_SURVEY = process.env?.DELAY_BETWEEN_SURVEY;
// 2 days
export const DELAY_BETWEEN_AD_PERSONALIZATION = process.env?.DELAY_BETWEEN_AD_PERSONALIZATION;