import { create } from 'zustand';
import { Locale } from '../i18n';
import {
  AuthContext,
  SavedNetworkDoc,
  signInAnonymouslyUser,
  linkAnonymousWithGoogle,
  saveLevelProgressToFirestore,
  loadUserProgressFromFirestore,
  saveNetworkToFirestore,
  listSavedNetworksForLevel,
  persistAuthSession,
} from '../services/firebase';
import {
  ActivationFunction,
  NetworkParameters,
  NetworkTopology,
  WeightInitStrategy,
  countHiddenNeurons,
  deserializeParameters,
  initializeNetworkParameters,
  serializeParameters,
} from '../core/nn-core';
import { calculateStars } from '../core/scoring';
import {
  LEVELS,
  getIdealParametersForLevel,
  getLevelByNumber,
  LevelDefinition,
} from '../features/levels';

const LEVEL1 = getLevelByNumber(1);

export interface GameState {
  locale: Locale;
  activeLevelId: number;
  unlockedUpToLevel: number;
  starsByLevel: Record<string, 0 | 1 | 2 | 3>;
  savedNetworks: SavedNetworkDoc[];
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
  setActiveLevelId: (levelId: number) => Promise<void>;
  loadIdealNetworkForLevel: (level: LevelDefinition) => void;
  recordLevelCompletion: (completed: boolean, lossOverride?: number) => Promise<0 | 1 | 2 | 3>;
  saveCurrentNetwork: (name: string) => Promise<SavedNetworkDoc>;
  loadSavedNetwork: (doc: SavedNetworkDoc) => void;
  hydrateFromCloud: (sessionOverride?: AuthContext) => Promise<void>;
  setLastTrainingLoss: (loss: number) => void;
  setTopology: (topology: NetworkTopology) => void;
  setParameters: (parameters: NetworkParameters) => void;
  setLearningRate: (learningRate: number) => void;
  setEpochs: (epochs: number) => void;
  setActivation: (activation: ActivationFunction) => void;
  setWeightInit: (weightInit: WeightInitStrategy) => void;
  setUseBias: (useBias: boolean) => void;
  loginAnonymously: () => Promise<AuthContext>;
  linkGoogleAccount: (profileOverride?: {
    displayName: string;
    email: string;
  }) => Promise<AuthContext | null>;
}

export const useGameStore = create<GameState>((set, get) => ({
  locale: 'pt-BR',
  activeLevelId: 1,
  unlockedUpToLevel: 1,
  starsByLevel: {},
  savedNetworks: [],
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
  setActiveLevelId: async (activeLevelId) => {
    const level = getLevelByNumber(activeLevelId);
    const session = get().authSession;
    const savedNetworks = session
      ? await listSavedNetworksForLevel(session, level.id)
      : [];
    set({
      activeLevelId,
      topology: level.idealTopology,
      parameters: getIdealParametersForLevel(activeLevelId),
      activation: level.defaultActivation,
      lastTrainingLoss: level.targetLoss * 0.5,
      savedNetworks,
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
  recordLevelCompletion: async (completed, lossOverride) => {
    const state = get();
    const level = getLevelByNumber(state.activeLevelId);
    const effectiveLoss = lossOverride ?? state.lastTrainingLoss;
    const neuronsUsed = countHiddenNeurons(state.topology);
    const stars = calculateStars({
      completed,
      finalLoss: effectiveLoss,
      targetLoss: level.targetLoss,
      neuronsUsed,
      idealNeurons: level.idealHiddenNeurons,
    });

    if (stars > 0) {
      const prevStars = state.starsByLevel[level.id] ?? 0;
      const bestStars = Math.max(prevStars, stars) as 0 | 1 | 2 | 3;
      const nextStarsMap = {
        ...state.starsByLevel,
        [level.id]: bestStars,
      };
      const nextUnlocked = Math.min(
        5,
        Math.max(state.unlockedUpToLevel, level.levelNumber + 1),
      );
      set({
        starsByLevel: nextStarsMap,
        unlockedUpToLevel: nextUnlocked,
      });

      const session = state.authSession ?? (await signInAnonymouslyUser());
      const totalStars = Object.values(nextStarsMap).reduce<number>((a, b) => a + b, 0);
      await saveLevelProgressToFirestore(
        session,
        level.id,
        {
          stars: bestStars,
          bestLoss: effectiveLoss,
          neuronsUsed,
          attempts: 1,
          completedAt: new Date().toISOString(),
        },
        totalStars,
        state.locale,
      );
    }
    return stars;
  },
  saveCurrentNetwork: async (name) => {
    const state = get();
    const session = state.authSession ?? (await signInAnonymouslyUser());
    const level = getLevelByNumber(state.activeLevelId);
    const flatWeights = serializeParameters(state.topology, state.parameters);

    const saved = await saveNetworkToFirestore(session, {
      levelId: level.id,
      name: name.trim() || `Rede ${level.title[state.locale]}`,
      topology: state.topology,
      weights: flatWeights,
      params: {
        learningRate: state.learningRate,
        epochs: state.epochs,
        activation: state.activation,
        useBias: state.useBias,
      },
    });

    const updatedList = await listSavedNetworksForLevel(session, level.id);
    set({ authSession: session, savedNetworks: updatedList });
    return saved;
  },
  loadSavedNetwork: (docItem) => {
    const restoredParams = deserializeParameters(docItem.topology, docItem.weights);
    set({
      topology: docItem.topology,
      parameters: restoredParams,
      learningRate: docItem.params.learningRate,
      epochs: docItem.params.epochs,
      activation: docItem.params.activation as ActivationFunction,
      useBias: docItem.params.useBias,
    });
  },
  hydrateFromCloud: async (sessionOverride) => {
    const session = sessionOverride ?? get().authSession ?? (await signInAnonymouslyUser());
    persistAuthSession(session);
    const { profile, progressByLevel } = await loadUserProgressFromFirestore(session);
    const starsByLevel: Record<string, 0 | 1 | 2 | 3> = {};
    let highestUnlocked = 1;

    for (const lvl of LEVELS) {
      const p = progressByLevel[lvl.id];
      if (p && p.stars > 0) {
        starsByLevel[lvl.id] = p.stars;
        highestUnlocked = Math.min(5, Math.max(highestUnlocked, lvl.levelNumber + 1));
      }
    }

    const currentLevel = getLevelByNumber(get().activeLevelId);
    const savedNetworks = await listSavedNetworksForLevel(session, currentLevel.id);

    set({
      authSession: session,
      locale: profile?.locale ?? get().locale,
      starsByLevel,
      unlockedUpToLevel: highestUnlocked,
      savedNetworks,
    });
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
    await get().hydrateFromCloud(session);
    return session;
  },
  linkGoogleAccount: async (profileOverride) => {
    const current = get().authSession ?? (await signInAnonymouslyUser());
    const linked = await linkAnonymousWithGoogle(current, profileOverride);
    await get().hydrateFromCloud(linked);
    return linked;
  },
}));
