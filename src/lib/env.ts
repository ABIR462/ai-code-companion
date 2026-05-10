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
  | "VITE_NVIDIA_API_KEY"
  | "VITE_NVIDIA_API_BASE_URL"
  | "VITE_NVIDIA_CHAT_MODEL"
  | "VITE_NVIDIA_GENAI_BASE_URL"
  | "VITE_NVIDIA_IMAGE_GENAI_PATH"
  | "VITE_NVIDIA_IMAGE_STEPS"
  | "VITE_NVIDIA_IMAGE_POLLINATIONS_FALLBACK"
  | "VITE_OPENROUTER_API_KEY"
  | "VITE_OPENROUTER_CHAT_MODEL"
  | "VITE_OPENROUTER_IMAGE_MODEL";

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
  nvidia: {
    apiKey: readEnv("VITE_NVIDIA_API_KEY"),
    apiBaseUrl: readEnv("VITE_NVIDIA_API_BASE_URL", "https://integrate.api.nvidia.com/v1"),
    chatModel: readEnv("VITE_NVIDIA_CHAT_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
    /** Text-to-image via NVIDIA GenAI (e.g. Qwen-Image): POST {base}/genai/{path} */
    genAiBaseUrl: readEnv("VITE_NVIDIA_GENAI_BASE_URL", "https://ai.api.nvidia.com/v1"),
    imageGenAiPath: readEnv("VITE_NVIDIA_IMAGE_GENAI_PATH", "qwen/qwen-image"),
    /** If set (e.g. 25), sent as `steps` on the GenAI payload; omit when 0 for broader API compatibility. */
    imageSteps: (() => {
      const s = readEnv("VITE_NVIDIA_IMAGE_STEPS");
      if (!s) return 0;
      const n = Number.parseInt(s, 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    })(),
    imagePollinationsFallback: !["0", "false", "no", "off"].includes(
      readEnv("VITE_NVIDIA_IMAGE_POLLINATIONS_FALLBACK", "true").toLowerCase(),
    ),
  },
  openrouter: {
    apiKey: readEnv("VITE_OPENROUTER_API_KEY"),
    chatModel: readEnv("VITE_OPENROUTER_CHAT_MODEL", "openai/gpt-4o-mini"),
    imageModel: readEnv("VITE_OPENROUTER_IMAGE_MODEL", "openai/gpt-5.4-image-2"),
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

export const nvidiaMissingEnvKeys = [["VITE_NVIDIA_API_KEY", appEnv.nvidia.apiKey]].flatMap(([key, value]) =>
  value ? [] : [key],
);

export const isFirebaseConfigured = firebaseMissingEnvKeys.length === 0;
export const isMistralConfigured = mistralMissingEnvKeys.length === 0;
export const isNvidiaConfigured = nvidiaMissingEnvKeys.length === 0;

export const isOpenRouterConfigured = !!appEnv.openrouter.apiKey;

/** Supernova text chat works with either OpenRouter or NVIDIA. */
export const isSupernovaChatConfigured = isOpenRouterConfigured || isNvidiaConfigured;
