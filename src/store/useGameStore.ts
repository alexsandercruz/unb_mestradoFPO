import { create } from 'zustand';
import { Locale } from '../i18n';
import {
  AuthContext,
  signInAnonymouslyUser,
  linkAnonymousWithGoogle,
} from '../services/firebase';

export interface GameState {
  locale: Locale;
  activeLevelId: number;
  authSession: AuthContext | null;
  setLocale: (locale: Locale) => void;
  setActiveLevelId: (levelId: number) => void;
  loginAnonymously: () => Promise<AuthContext>;
  linkGoogleAccount: () => Promise<AuthContext | null>;
}

export const useGameStore = create<GameState>((set, get) => ({
  locale: 'pt-BR',
  activeLevelId: 1,
  authSession: null,
  setLocale: (locale) => set({ locale }),
  setActiveLevelId: (activeLevelId) => set({ activeLevelId }),
  loginAnonymously: async () => {
    const session = await signInAnonymouslyUser();
    set({ authSession: session });
    return session;
  },
  linkGoogleAccount: async () => {
    const current = get().authSession ?? (await signInAnonymouslyUser());
    const linked = await linkAnonymousWithGoogle(current);
    set({ authSession: linked });
    return linked;
  },
}));
