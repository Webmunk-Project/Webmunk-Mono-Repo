import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';

initializeApp();
const db = getFirestore();

export const signIn = onCall<{ prolificId: string }>(async (request) => {
  const sessionUid = request.auth?.uid;
  const { prolificId } = request.data;

  if (!sessionUid || !prolificId) {
    throw new HttpsError('invalid-argument', 'Invalid arguments: Uid and prolificId are required.');
  }

  try {
    const userRef = db.collection('users').doc(prolificId);
    const userDoc = await userRef.get();
    const user = {
      sessionUid,
      prolificId,
      uid: '',
      active: false
    };

    if (userDoc.exists) {
      user.uid = userDoc.data()?.uid;
      user.active = userDoc.data()?.active;

      await userRef.update({ sessionUid });
    } else {
      user.uid = uuidv4();
      user.active = true;

      await userRef.set(user);
    }

    return user;
  } catch (error) {
    throw new HttpsError('internal', 'Oops!');
  }
});
