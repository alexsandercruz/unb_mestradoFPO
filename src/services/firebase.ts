export interface FirebaseEnvConfig {
  projectId: string;
}

export function getFirebaseProjectId(): string {
  return import.meta.env.VITE_FIREBASE_PROJECT_ID || 'neurobot-dev';
}

