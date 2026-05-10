type RuntimeEnvKey =
  | "VITE_FIREBASE_API_KEY"
  | "VITE_FIREBASE_AUTH_DOMAIN"
  | "VITE_FIREBASE_PROJECT_ID"
  | "VITE_FIREBASE_STORAGE_BUCKET"
  | "VITE_FIREBASE_MESSAGING_SENDER_ID"
  | "VITE_FIREBASE_APP_ID"
  | "VITE_FIREBASE_MEASUREMENT_ID"
  | "VITE_MISTRAL_API_KEY"
  | "VITE_MISTRAL_MODEL"
  | "VITE_MISTRAL_API_BASE_URL"
  | "VITE_OPENROUTER_API_KEY"
  | "VITE_OPENROUTER_CHAT_MODEL"
  | "VITE_OPENROUTER_IMAGE_MODEL"
  | "VITE_OPENROUTER_API_BASE_URL";

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
  mistral: {
    apiKey: readEnv("VITE_MISTRAL_API_KEY"),
    model: readEnv("VITE_MISTRAL_MODEL", "codestral-2508"),
    apiBaseUrl: readEnv("VITE_MISTRAL_API_BASE_URL", "https://api.mistral.ai/v1"),
  },
  openrouter: {
    apiKey: readEnv("VITE_OPENROUTER_API_KEY"),
    chatModel: readEnv("VITE_OPENROUTER_CHAT_MODEL", "openai/gpt-4o-mini"),
    imageModel: readEnv("VITE_OPENROUTER_IMAGE_MODEL", "openai/gpt-5.4-image-2"),
    apiBaseUrl: readEnv("VITE_OPENROUTER_API_BASE_URL", "https://openrouter.ai/api/v1"),
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

export const mistralMissingEnvKeys = [["VITE_MISTRAL_API_KEY", appEnv.mistral.apiKey]].flatMap(([key, value]) =>
  value ? [] : [key],
);

export const isFirebaseConfigured = firebaseMissingEnvKeys.length === 0;
export const isMistralConfigured = mistralMissingEnvKeys.length === 0;
export const isOpenRouterConfigured = !!appEnv.openrouter.apiKey;
export const isSupernovaChatConfigured = isOpenRouterConfigured;
