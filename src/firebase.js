import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBLwHVZSiqlsSQimMuuOrQnFP6FlFP2sO4",
  authDomain: "siten-fee7d.firebaseapp.com",
  projectId: "siten-fee7d",
  storageBucket: "siten-fee7d.firebasestorage.app",
  messagingSenderId: "176396757393",
  appId: "1:176396757393:web:2dd4684c65f51cc1e59230",
  measurementId: "G-EEENXBMLGY",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
