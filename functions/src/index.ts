import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

export const signIn = onCall<{ prolificId: string }>(async (request) => {
  logger.info('signIn request >>>', request);

  const uid = request.auth?.uid;
  const { prolificId } = request.data;

  if (!uid || !prolificId) {
    throw new HttpsError('invalid-argument', 'Invalid arguments: Uid and prolificId are required.');
  }

  try {
    const userRef = db.collection('users').doc(prolificId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      await userRef.update({ uid });
    } else {
      await userRef.set({ uid });
    }

    return { uid, prolificId };
  } catch (error) {
    throw new HttpsError('internal', 'Oops!');
  }
});
