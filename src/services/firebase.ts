import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously as fbSignInAnonymously,
  GoogleAuthProvider,
  linkWithPopup,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  Firestore,
  doc,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { NetworkTopology } from '../core/nn-core';
import { Locale } from '../i18n';
import { LEVEL_IDS } from '../levels';

export interface AuthContext {
  uid: string;
  isAnonymous: boolean;
  displayName: string;
  email?: string | null;
}

export interface UserProfileDoc {
  displayName: string;
  createdAt: string;
  lastLevel: string;
  totalStars: number;
  locale: Locale;
}

export interface LevelProgressDoc {
  stars: 0 | 1 | 2 | 3;
  bestLoss: number;
  neuronsUsed: number;
  attempts: number;
  completedAt: string;
}

export interface SavedNetworkDoc {
  id: string;
  levelId: string;
  name: string;
  topology: NetworkTopology;
  weights: number[];
  params: {
    learningRate: number;
    epochs: number;
    activation: string;
    useBias: boolean;
  };
  savedAt: string;
}

export class FirebasePermissionError extends Error {
  public readonly code = 'permission-denied';
  constructor(message = 'Missing or insufficient permissions.') {
    super(message);
    this.name = 'FirebasePermissionError';
  }
}

export const MAX_SAVED_NETWORKS_PER_LEVEL = 10;

export const DEFAULT_FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}`;

export function evaluateFirestoreRules(
  rulesContent: string,
  request: {
    auth: { uid: string } | null;
    path: string;
    method: 'read' | 'write';
  },
): boolean {
  const hasUserWildcardMatch =
    rulesContent.includes('match /users/{uid}/{document=**}') &&
    rulesContent.includes('request.auth != null && request.auth.uid == uid');

  if (!hasUserWildcardMatch) {
    return false;
  }

  if (!request.auth || !request.auth.uid) {
    return false;
  }

  const normalized = request.path.replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (segments.length < 2 || segments[0] !== 'users') {
    return false;
  }

  const targetUid = segments[1];
  return request.auth.uid === targetUid;
}

const STORAGE_AUTH_KEY = 'neurobot_emulator_auth_v1';
const STORAGE_DB_KEY = 'neurobot_emulator_firestore_v1';

function loadEmulatorDb(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_DB_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function saveEmulatorDb(db: Record<string, unknown>): void {
  try {
    localStorage.setItem(STORAGE_DB_KEY, JSON.stringify(db));
  } catch {
    // ignore
  }
}

let firebaseAppInstance: FirebaseApp | null = null;
let firebaseAuthInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;
let emulatorsConnected = false;

export function getFirebaseProjectId(): string {
  return import.meta.env.VITE_FIREBASE_PROJECT_ID || 'neurobot-dev';
}

export function initFirebaseClient(): {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
} {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-neurobot-key',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'neurobot-dev.firebaseapp.com',
    projectId: getFirebaseProjectId(),
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'neurobot-dev.appspot.com',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:neurobot',
  };

  if (!firebaseAppInstance) {
    firebaseAppInstance = getApps().length > 0 ? getApps()[0] : initializeApp(config);
    firebaseAuthInstance = getAuth(firebaseAppInstance);
    firestoreInstance = getFirestore(firebaseAppInstance);

    const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR !== 'false';
    if (useEmulator && !emulatorsConnected) {
      try {
        const authHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
        const [fsHost, fsPortStr] = (
          import.meta.env.VITE_FIRESTORE_EMULATOR_HOST || 'localhost:8080'
        ).split(':');
        connectAuthEmulator(firebaseAuthInstance, `http://${authHost}`, {
          disableWarnings: true,
        });
        connectFirestoreEmulator(firestoreInstance, fsHost, Number(fsPortStr || 8080));
        emulatorsConnected = true;
      } catch {
        // ignore
      }
    }
  }

  return {
    app: firebaseAppInstance!,
    auth: firebaseAuthInstance!,
    db: firestoreInstance!,
  };
}

export function getPersistedAuthSession(): AuthContext | null {
  try {
    const raw = localStorage.getItem(STORAGE_AUTH_KEY);
    return raw ? (JSON.parse(raw) as AuthContext) : null;
  } catch {
    return null;
  }
}

export function persistAuthSession(session: AuthContext | null): void {
  try {
    if (!session) {
      localStorage.removeItem(STORAGE_AUTH_KEY);
    } else {
      localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore
  }
}

export async function signInAnonymouslyUser(): Promise<AuthContext> {
  const existing = getPersistedAuthSession();
  if (existing) {
    return existing;
  }

  let uid = `anon_${Math.random().toString(36).slice(2, 10)}`;

  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'false' && import.meta.env.VITE_FIREBASE_API_KEY) {
    try {
      const { auth } = initFirebaseClient();
      const cred = await fbSignInAnonymously(auth);
      uid = cred.user.uid;
    } catch {
      // fallback
    }
  }

  const session: AuthContext = {
    uid,
    isAnonymous: true,
    displayName: 'Cientista Anônimo',
    email: null,
  };

  persistAuthSession(session);

  const existingProfile = await emulatorReadDoc<UserProfileDoc>(session, `users/${uid}`);
  if (!existingProfile) {
    await emulatorWriteDoc(session, `users/${uid}`, {
      displayName: session.displayName,
      createdAt: new Date().toISOString(),
      lastLevel: '01-first-step',
      totalStars: 0,
      locale: 'pt-BR',
    } satisfies UserProfileDoc);
  }

  return session;
}

export async function linkAnonymousWithGoogle(
  currentSession: AuthContext,
  googleProfile?: { displayName: string; email: string },
): Promise<AuthContext> {
  let displayName = googleProfile?.displayName || 'Explorador Google';
  let email: string | null = googleProfile?.email || 'estudante@escola.edu.br';

  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'false' && import.meta.env.VITE_FIREBASE_API_KEY) {
    try {
      const { auth } = initFirebaseClient();
      if (auth.currentUser) {
        const provider = new GoogleAuthProvider();
        const result = await linkWithPopup(auth.currentUser, provider);
        displayName = result.user.displayName || displayName;
        email = result.user.email || email;
      }
    } catch {
      // fallback
    }
  }

  const linkedSession: AuthContext = {
    uid: currentSession.uid,
    isAnonymous: false,
    displayName,
    email,
  };

  persistAuthSession(linkedSession);

  const existingProfile = await emulatorReadDoc<UserProfileDoc>(
    linkedSession,
    `users/${linkedSession.uid}`,
  );

  await emulatorWriteDoc(linkedSession, `users/${linkedSession.uid}`, {
    displayName,
    createdAt: existingProfile?.createdAt || new Date().toISOString(),
    lastLevel: existingProfile?.lastLevel || '01-first-step',
    totalStars: existingProfile?.totalStars || 0,
    locale: existingProfile?.locale || 'pt-BR',
  } satisfies UserProfileDoc);

  return linkedSession;
}

export async function emulatorReadDoc<T>(
  auth: { uid: string } | null,
  path: string,
  rulesSource: string = DEFAULT_FIRESTORE_RULES,
): Promise<T | null> {
  const allowed = evaluateFirestoreRules(rulesSource, {
    auth,
    path,
    method: 'read',
  });

  if (!allowed) {
    throw new FirebasePermissionError(
      `Firestore Rules blocked read on "${path}" for uid="${auth?.uid ?? 'unauthenticated'}"`,
    );
  }

  const normalized = path.replace(/^\/+/, '');
  const db = loadEmulatorDb();
  const value = db[normalized];

  if (value !== undefined) {
    return value as T;
  }

  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'false' && import.meta.env.VITE_FIREBASE_API_KEY) {
    try {
      const { db: firestore } = initFirebaseClient();
      const snap = await getDoc(doc(firestore, normalized));
      if (snap.exists()) {
        return snap.data() as T;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export async function emulatorWriteDoc<T>(
  auth: { uid: string } | null,
  path: string,
  data: T,
  rulesSource: string = DEFAULT_FIRESTORE_RULES,
): Promise<void> {
  const allowed = evaluateFirestoreRules(rulesSource, {
    auth,
    path,
    method: 'write',
  });

  if (!allowed) {
    throw new FirebasePermissionError(
      `Firestore Rules blocked write on "${path}" for uid="${auth?.uid ?? 'unauthenticated'}"`,
    );
  }

  const normalized = path.replace(/^\/+/, '');
  const db = loadEmulatorDb();
  db[normalized] = data;
  saveEmulatorDb(db);

  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'false' && import.meta.env.VITE_FIREBASE_API_KEY) {
    try {
      const { db: firestore } = initFirebaseClient();
      await setDoc(doc(firestore, normalized), data as Record<string, unknown>, { merge: true });
    } catch {
      // ignore
    }
  }
}

export async function saveLevelProgressToFirestore(
  auth: AuthContext,
  levelId: string,
  progress: LevelProgressDoc,
  totalStars: number,
  locale: Locale,
): Promise<void> {
  await emulatorWriteDoc(auth, `users/${auth.uid}/progress/${levelId}`, progress);

  const existingProfile = await emulatorReadDoc<UserProfileDoc>(auth, `users/${auth.uid}`);
  await emulatorWriteDoc(auth, `users/${auth.uid}`, {
    displayName: auth.displayName,
    createdAt: existingProfile?.createdAt || new Date().toISOString(),
    lastLevel: levelId,
    totalStars,
    locale,
  } satisfies UserProfileDoc);
}

export async function loadUserProgressFromFirestore(auth: AuthContext): Promise<{
  profile: UserProfileDoc | null;
  progressByLevel: Record<string, LevelProgressDoc>;
}> {
  const profile = await emulatorReadDoc<UserProfileDoc>(auth, `users/${auth.uid}`);
  const progressByLevel: Record<string, LevelProgressDoc> = {};

  for (const levelId of LEVEL_IDS) {
    const docData = await emulatorReadDoc<LevelProgressDoc>(
      auth,
      `users/${auth.uid}/progress/${levelId}`,
    );
    if (docData) {
      progressByLevel[levelId] = docData;
    }
  }

  return { profile, progressByLevel };
}

/**
 * Salva uma rede em users/{uid}/networks/{networkId} respeitando o limite de até 10 redes por fase (RF-09).
 */
export async function saveNetworkToFirestore(
  auth: AuthContext,
  network: Omit<SavedNetworkDoc, 'id' | 'savedAt'> & { id?: string },
): Promise<SavedNetworkDoc> {
  const existingForLevel = await listSavedNetworksForLevel(auth, network.levelId);
  const isUpdatingExisting = network.id && existingForLevel.some((n) => n.id === network.id);

  if (!isUpdatingExisting && existingForLevel.length >= MAX_SAVED_NETWORKS_PER_LEVEL) {
    throw new Error(`Maximum of ${MAX_SAVED_NETWORKS_PER_LEVEL} saved networks per level reached.`);
  }

  const networkId = network.id || `net_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const fullDoc: SavedNetworkDoc = {
    id: networkId,
    levelId: network.levelId,
    name: network.name,
    topology: network.topology,
    weights: network.weights,
    params: network.params,
    savedAt: new Date().toISOString(),
  };

  await emulatorWriteDoc(auth, `users/${auth.uid}/networks/${networkId}`, fullDoc);
  return fullDoc;
}

export async function listSavedNetworksForLevel(
  auth: AuthContext,
  levelId: string,
): Promise<SavedNetworkDoc[]> {
  const allowed = evaluateFirestoreRules(DEFAULT_FIRESTORE_RULES, {
    auth,
    path: `users/${auth.uid}/networks/any`,
    method: 'read',
  });
  if (!allowed) {
    throw new FirebasePermissionError();
  }

  const prefix = `users/${auth.uid}/networks/`;
  const db = loadEmulatorDb();
  const list: SavedNetworkDoc[] = [];

  for (const [key, val] of Object.entries(db)) {
    if (key.startsWith(prefix) && val) {
      const docItem = val as SavedNetworkDoc;
      if (docItem.levelId === levelId) {
        list.push(docItem);
      }
    }
  }

  return list.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

export function clearEmulatorStorage(): void {
  try {
    localStorage.removeItem(STORAGE_AUTH_KEY);
    localStorage.removeItem(STORAGE_DB_KEY);
  } catch {
    // ignore
  }
}
