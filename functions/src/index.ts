import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';

initializeApp();
const db = getFirestore();

export const signIn = onCall<{ prolificId: string }>(async (request) => {
  logger.info('signIn request >>>', request);

  const sessionUid = request.auth?.uid;
  const { prolificId } = request.data;

  if (!sessionUid || !prolificId) {
    throw new HttpsError('invalid-argument', 'Invalid arguments: Uid and prolificId are required.');
  }

  try {
    const userRef = db.collection('users').doc(prolificId);
    const userDoc = await userRef.get();
    let uid: string;

    if (userDoc.exists) {
      uid = userDoc.data()?.uid;
      await userRef.update({ sessionUid });
    } else {
      uid = uuidv4();

      await userRef.set({ sessionUid, uid });
    }

    return { sessionUid, prolificId, uid };
  } catch (error) {
    throw new HttpsError('internal', 'Oops!');
  }
});
