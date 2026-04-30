import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";

export type Profile = {
  uid: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  bio?: string;
  status?: string;
  updatedAt?: any;
  createdAt?: any;
};

const ref = (uid: string) => doc(db, "profiles", uid);

export async function ensureProfile(p: { uid: string; displayName?: string | null; email?: string | null; photoURL?: string | null }) {
  const snap = await getDoc(ref(p.uid));
  if (!snap.exists()) {
    await setDoc(ref(p.uid), {
      uid: p.uid,
      displayName: p.displayName || (p.email ? p.email.split("@")[0] : "Matrixbook user"),
      email: p.email ?? "",
      photoURL: p.photoURL ?? "",
      bio: "",
      status: "Vibing on Matrixbook",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function updateProfile(uid: string, patch: Partial<Profile>) {
  await setDoc(ref(uid), { ...patch, uid, updatedAt: serverTimestamp() }, { merge: true });
}

export function subscribeProfile(uid: string, cb: (p: Profile | null) => void) {
  return onSnapshot(ref(uid), (s) => cb(s.exists() ? (s.data() as Profile) : null));
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const s = await getDoc(ref(uid));
  return s.exists() ? (s.data() as Profile) : null;
}