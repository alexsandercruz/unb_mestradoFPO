import { create } from 'zustand';
import { Locale } from '../i18n';

export interface GameState {
  locale: Locale;
  activeLevelId: number;
  setLocale: (locale: Locale) => void;
  setActiveLevelId: (levelId: number) => void;
}

export const useGameStore = create<GameState>((set) => ({
  locale: 'pt-BR',
  activeLevelId: 1,
  setLocale: (locale) => set({ locale }),
  setActiveLevelId: (activeLevelId) => set({ activeLevelId }),
}));

