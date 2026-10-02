import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCFIOv6Fumi9X9QADC7Cb9N1k4DuKhTsiM",
  authDomain: "pran-sticker-zone.firebaseapp.com",
  projectId: "pran-sticker-zone",
  storageBucket: "pran-sticker-zone.firebasestorage.app",
  messagingSenderId: "26045466238",
  appId: "1:26045466238:web:9e0213df9106a0a288fa2f",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
