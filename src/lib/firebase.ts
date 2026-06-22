import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "gen-lang-client-0425568756",
  appId: "1:1039642639582:web:19535e7f6ad43d9571164f",
  apiKey: "AIzaSyBqaLKt1CTAEYgTH405I4OprC2io-8s0kw",
  authDomain: "gen-lang-client-0425568756.firebaseapp.com",
  storageBucket: "gen-lang-client-0425568756.firebasestorage.app",
  messagingSenderId: "1039642639582",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
