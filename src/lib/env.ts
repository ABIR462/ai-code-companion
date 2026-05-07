type RuntimeEnvKey =
  | "VITE_FIREBASE_API_KEY"
  | "VITE_FIREBASE_AUTH_DOMAIN"
  | "VITE_FIREBASE_PROJECT_ID"
  | "VITE_FIREBASE_STORAGE_BUCKET"
  | "VITE_FIREBASE_MESSAGING_SENDER_ID"
  | "VITE_FIREBASE_APP_ID"
  | "VITE_FIREBASE_MEASUREMENT_ID"
  | "VITE_GEMINI_API_KEY"
  | "VITE_GEMINI_CHAT_MODEL"
  | "VITE_GEMINI_IMAGE_MODEL"
  | "VITE_OPENROUTER_API_KEY"
  | "VITE_OPENROUTER_MODEL";

const readEnv = (key: RuntimeEnvKey, fallback = "") => {
  const value = import.meta.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

export const appEnv = {
  firebase: {
    apiKey: readEnv("VITE_FIREBASE_API_KEY"),
    authDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: readEnv("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: readEnv("VITE_FIREBASE_APP_ID"),
    measurementId: readEnv("VITE_FIREBASE_MEASUREMENT_ID"),
  },
  gemini: {
    apiKey: readEnv("VITE_GEMINI_API_KEY"),
    chatModel: readEnv("VITE_GEMINI_CHAT_MODEL", "gemini-2.0-flash"),
    imageModel: readEnv("VITE_GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"),
  },
  openrouter: {
    apiKey: readEnv("VITE_OPENROUTER_API_KEY"),
    model: readEnv("VITE_OPENROUTER_MODEL", "deepseek/deepseek-v3.2"),
  },
} as const;

export const firebaseMissingEnvKeys = [
  ["VITE_FIREBASE_API_KEY", appEnv.firebase.apiKey],
  ["VITE_FIREBASE_AUTH_DOMAIN", appEnv.firebase.authDomain],
  ["VITE_FIREBASE_PROJECT_ID", appEnv.firebase.projectId],
  ["VITE_FIREBASE_STORAGE_BUCKET", appEnv.firebase.storageBucket],
  ["VITE_FIREBASE_MESSAGING_SENDER_ID", appEnv.firebase.messagingSenderId],
  ["VITE_FIREBASE_APP_ID", appEnv.firebase.appId],
].flatMap(([key, value]) => (value ? [] : [key]));

export const openRouterMissingEnvKeys = [
  ["VITE_OPENROUTER_API_KEY", appEnv.openrouter.apiKey],
  ["VITE_OPENROUTER_MODEL", appEnv.openrouter.model],
].flatMap(([key, value]) => (value ? [] : [key]));

export const isFirebaseConfigured = firebaseMissingEnvKeys.length === 0;
export const isGeminiConfigured = !!appEnv.gemini.apiKey;
export const isOpenRouterConfigured = openRouterMissingEnvKeys.length === 0;
