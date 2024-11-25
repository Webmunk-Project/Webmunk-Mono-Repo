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
// 2 weeks
export const DELAY_WHILE_AD_BLOCKER = process.env?.DELAY_WHILE_AD_BLOCKER;
// 2 days
export const DELAY_BETWEEN_AD_PERSONALIZATION = process.env?.DELAY_BETWEEN_AD_PERSONALIZATION;
// 1 days
export const DELAY_BETWEEN_REMOVE_NOTIFICATION = process.env?.DELAY_BETWEEN_REMOVE_NOTIFICATION;
// 5 minutes
export const DELAY_BETWEEN_FILL_OUT_NOTIFICATION = process.env?.DELAY_BETWEEN_FILL_OUT_NOTIFICATION;
// 1 hour
export const REMOTE_CONFIG_FETCH_INTERVAL = process.env?.REMOTE_CONFIG_FETCH_INTERVAL;
// 1 hour
export const USER_FETCH_INTERVAL = process.env?.USER_FETCH_INTERVAL;