import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

/**
 * Firebase web config. These values are PUBLIC by design — they ship in every
 * client bundle. Security is enforced by Firebase Auth + Firestore security
 * rules (see firestore.rules), NOT by hiding this config.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyAjqKuEWI3xzYaHN594Evod45gsSYALfLc',
  authDomain: 'ethan-488900.firebaseapp.com',
  projectId: 'ethan-488900',
  storageBucket: 'ethan-488900.firebasestorage.app',
  messagingSenderId: '108003293186',
  appId: '1:108003293186:web:c9270c261acea823164f1b',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
