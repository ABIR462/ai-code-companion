/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly MODE: string;
  readonly PROD: boolean;
  readonly SSR: boolean;
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  readonly VITE_MISTRAL_API_KEY: string;
  readonly VITE_MISTRAL_MODEL: string;
  readonly VITE_MISTRAL_API_BASE_URL: string;
  readonly VITE_NVIDIA_API_KEY: string;
  readonly VITE_NVIDIA_API_BASE_URL: string;
  readonly VITE_NVIDIA_CHAT_MODEL: string;
  readonly VITE_NVIDIA_GENAI_BASE_URL: string;
  readonly VITE_NVIDIA_IMAGE_GENAI_PATH: string;
  readonly VITE_NVIDIA_IMAGE_STEPS: string;
  readonly VITE_NVIDIA_IMAGE_POLLINATIONS_FALLBACK: string;
  readonly VITE_OPENROUTER_API_KEY: string;
  readonly VITE_OPENROUTER_CHAT_MODEL: string;
  readonly VITE_OPENROUTER_IMAGE_MODEL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
