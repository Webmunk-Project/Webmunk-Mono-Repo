import { initializeApp, type FirebaseOptions, type FirebaseApp } from 'firebase/app';

import { FIREBASE_CONFIG } from '../config';

export class FirebaseAppService {
  private readonly firebaseApp = initializeApp(FIREBASE_CONFIG);

  public getConfig(): FirebaseOptions {
    return FIREBASE_CONFIG;
  }

  public getFirebaseApp(): FirebaseApp {
    return this.firebaseApp;
  }
}
