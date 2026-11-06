import { create } from 'zustand';
import { Locale } from '../i18n';
import {
  AuthContext,
  signInAnonymouslyUser,
  linkAnonymousWithGoogle,
} from '../services/firebase';
import {
  ActivationFunction,
  NetworkParameters,
  NetworkTopology,
  WeightInitStrategy,
  countHiddenNeurons,
  initializeNetworkParameters,
} from '../core/nn-core';
import { calculateStars } from '../core/scoring';
import { getIdealParametersForLevel, getLevelByNumber, LevelDefinition } from '../features/levels';

const LEVEL1 = getLevelByNumber(1);

export interface GameState {
  locale: Locale;
  activeLevelId: number;
  unlockedUpToLevel: number;
  starsByLevel: Record<string, 0 | 1 | 2 | 3>;
  lastTrainingLoss: number;
  authSession: AuthContext | null;
  topology: NetworkTopology;
  parameters: NetworkParameters;
  learningRate: number;
  epochs: number;
  activation: ActivationFunction;
  weightInit: WeightInitStrategy;
  useBias: boolean;
  setLocale: (locale: Locale) => void;
  setActiveLevelId: (levelId: number) => void;
  loadIdealNetworkForLevel: (level: LevelDefinition) => void;
  recordLevelCompletion: (completed: boolean, lossOverride?: number) => 0 | 1 | 2 | 3;
  setLastTrainingLoss: (loss: number) => void;
  setTopology: (topology: NetworkTopology) => void;
  setParameters: (parameters: NetworkParameters) => void;
  setLearningRate: (learningRate: number) => void;
  setEpochs: (epochs: number) => void;
  setActivation: (activation: ActivationFunction) => void;
  setWeightInit: (weightInit: WeightInitStrategy) => void;
  setUseBias: (useBias: boolean) => void;
  loginAnonymously: () => Promise<AuthContext>;
  linkGoogleAccount: () => Promise<AuthContext | null>;
}

export const useGameStore = create<GameState>((set, get) => ({
  locale: 'pt-BR',
  activeLevelId: 1,
  unlockedUpToLevel: 1,
  starsByLevel: {},
  lastTrainingLoss: 0.02,
  authSession: null,
  topology: LEVEL1.idealTopology,
  parameters: getIdealParametersForLevel(1),
  learningRate: 0.25,
  epochs: 120,
  activation: LEVEL1.defaultActivation,
  weightInit: 'deterministic',
  useBias: true,
  setLocale: (locale) => set({ locale }),
  setActiveLevelId: (activeLevelId) => {
    const level = getLevelByNumber(activeLevelId);
    set({
      activeLevelId,
      topology: level.idealTopology,
      parameters: getIdealParametersForLevel(activeLevelId),
      activation: level.defaultActivation,
      lastTrainingLoss: level.targetLoss * 0.5,
    });
  },
  loadIdealNetworkForLevel: (level) => {
    set({
      topology: level.idealTopology,
      parameters: getIdealParametersForLevel(level.levelNumber),
      activation: level.defaultActivation,
      lastTrainingLoss: level.targetLoss * 0.4,
    });
  },
  recordLevelCompletion: (completed, lossOverride) => {
    const state = get();
    const level = getLevelByNumber(state.activeLevelId);
    const stars = calculateStars({
      completed,
      finalLoss: lossOverride ?? state.lastTrainingLoss,
      targetLoss: level.targetLoss,
      neuronsUsed: countHiddenNeurons(state.topology),
      idealNeurons: level.idealHiddenNeurons,
    });

    if (stars > 0) {
      const prevStars = state.starsByLevel[level.id] ?? 0;
      const bestStars = (Math.max(prevStars, stars) as 0 | 1 | 2 | 3);
      const nextUnlocked = Math.min(5, Math.max(state.unlockedUpToLevel, level.levelNumber + 1));
      set({
        starsByLevel: {
          ...state.starsByLevel,
          [level.id]: bestStars,
        },
        unlockedUpToLevel: nextUnlocked,
      });
    }
    return stars;
  },
  setLastTrainingLoss: (lastTrainingLoss) => set({ lastTrainingLoss }),
  setTopology: (topology) =>
    set((state) => {
      const nextParams = initializeNetworkParameters(topology, state.weightInit, 42);
      for (const [key, val] of Object.entries(state.parameters.linkWeights)) {
        if (key in nextParams.linkWeights) {
          nextParams.linkWeights[key] = val;
        }
      }
      for (const [key, val] of Object.entries(state.parameters.biases)) {
        if (key in nextParams.biases) {
          nextParams.biases[key] = val;
        }
      }
      return { topology, parameters: nextParams };
    }),
  setParameters: (parameters) => set({ parameters }),
  setLearningRate: (learningRate) => set({ learningRate }),
  setEpochs: (epochs) => set({ epochs }),
  setActivation: (activation) =>
    set((state) => ({
      activation,
      topology: {
        ...state.topology,
        hidden: state.topology.hidden.map((layer) =>
          layer.map((n) => ({ ...n, activation })),
        ),
      },
    })),
  setWeightInit: (weightInit) => set({ weightInit }),
  setUseBias: (useBias) => set({ useBias }),
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
