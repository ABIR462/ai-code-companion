import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "@/integrations/firebase/config";

export type SupernovaMessage = {
  id?: string;
  role: "user" | "assistant";
  kind: "text" | "image";
  content: string;            // text body, or assistant reply text for image messages
  images?: string[];          // attached/generated images (data URLs or http URLs)
  prompt?: string;            // for image kind: the prompt that produced the image
  createdAt?: any;
};

export type SupernovaConversation = {
  id: string;
  title: string;
  updatedAt?: any;
  createdAt?: any;
};

const convCol = (uid: string) => collection(db, "supernova_users", uid, "conversations");
const msgCol = (uid: string, cid: string) =>
  collection(db, "supernova_users", uid, "conversations", cid, "messages");

export async function createConversation(uid: string, title = "New chat") {
  const ref = await addDoc(convCol(uid), {
    title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function renameConversation(uid: string, cid: string, title: string) {
  await updateDoc(doc(db, "supernova_users", uid, "conversations", cid), {
    title,
    updatedAt: serverTimestamp(),
  });
}

export async function touchConversation(uid: string, cid: string) {
  await updateDoc(doc(db, "supernova_users", uid, "conversations", cid), {
    updatedAt: serverTimestamp(),
  });
}

export async function deleteConversation(uid: string, cid: string) {
  // Delete all messages first
  const msgs = await getDocs(msgCol(uid, cid));
  const batch = writeBatch(db);
  msgs.forEach((m) => batch.delete(m.ref));
  await batch.commit();
  await deleteDoc(doc(db, "supernova_users", uid, "conversations", cid));
}

export async function appendMessage(uid: string, cid: string, msg: SupernovaMessage) {
  const ref = await addDoc(msgCol(uid, cid), {
    ...msg,
    createdAt: serverTimestamp(),
  });
  await touchConversation(uid, cid);
  return ref.id;
}

export function subscribeConversations(
  uid: string,
  cb: (rows: SupernovaConversation[]) => void,
): Unsubscribe {
  const q = query(convCol(uid), orderBy("updatedAt", "desc"), limit(100));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => ({
        id: d.id,
        title: (d.data() as any).title ?? "Untitled",
        updatedAt: (d.data() as any).updatedAt,
        createdAt: (d.data() as any).createdAt,
      })),
    );
  });
}

export function subscribeMessages(
  uid: string,
  cid: string,
  cb: (rows: SupernovaMessage[]) => void,
): Unsubscribe {
  const q = query(msgCol(uid, cid), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
  });
}
