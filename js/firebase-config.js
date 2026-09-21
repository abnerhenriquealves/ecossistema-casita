import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, setDoc, onSnapshot, query, orderBy, writeBatch, where, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCjGBOUUThDgCqAOQJtXYeKdq2Pb0IG7PU",
  authDomain: "ecossistema-casita.firebaseapp.com",
  projectId: "ecossistema-casita",
  storageBucket: "ecossistema-casita.firebasestorage.app",
  messagingSenderId: "161524545654",
  appId: "1:161524545654:web:0362a680d6675b5e2e8757"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// 📌 Exportamos where e getDocs para as validações de orfandade
export { collection, addDoc, doc, updateDoc, deleteDoc, setDoc, onSnapshot, query, orderBy, writeBatch, where, getDocs };