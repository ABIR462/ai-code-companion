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
  readonly VITE_MISTRAL_IMAGE_API_KEY: string;
  readonly VITE_MISTRAL_MODEL: string;
  readonly VITE_MISTRAL_IMAGE_MODEL: string;
  readonly VITE_MISTRAL_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
