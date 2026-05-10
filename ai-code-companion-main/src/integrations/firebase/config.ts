import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { appEnv, firebaseMissingEnvKeys } from "@/lib/env";

if (firebaseMissingEnvKeys.length > 0) {
  console.error(
    `[Matrix AI] Missing Firebase .env values: ${firebaseMissingEnvKeys.join(", ")}. ` +
      "Firebase Auth and Firestore will not work until these VITE_ variables are set and Vite is restarted.",
  );
}

// Prevent duplicate app initialization in dev HMR
const app = getApps().length === 0 ? initializeApp(appEnv.firebase) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: "select_account" });

export default app;
