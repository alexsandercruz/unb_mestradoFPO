import { create } from 'zustand';
import { Locale } from '../i18n';
import { trackAnalyticsEvent } from '../services/firebase';
import {
  ActivationFunction,
  NetworkParameters,
  NetworkTopology,
  WeightInitStrategy,
  countHiddenNeurons,
  evaluateDatasetLoss,
  initializeNetworkParameters,
} from '../core/nn-core';
import { calculateStars } from '../core/scoring';
import {
  getUntunedParametersForLevel,
  getLevelByNumber,
  LevelDefinition,
} from '../features/levels';

const LEVEL1 = getLevelByNumber(1);
const INITIAL_PARAMS_L1 = getUntunedParametersForLevel(1);
const INITIAL_LOSS_L1 = evaluateDatasetLoss(
  LEVEL1.idealTopology,
  INITIAL_PARAMS_L1,
  LEVEL1.dataset,
  { useBias: true, outputActivation: LEVEL1.defaultActivation },
);

export interface GameState {
  locale: Locale;
  activeLevelId: number;
  unlockedUpToLevel: number;
  starsByLevel: Record<string, 0 | 1 | 2 | 3>;
  lastTrainingLoss: number;
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
  setLastTrainingLoss: (loss: number) => void;
  setTopology: (topology: NetworkTopology) => void;
  setParameters: (parameters: NetworkParameters) => void;
  setLearningRate: (learningRate: number) => void;
  setEpochs: (epochs: number) => void;
  setActivation: (activation: ActivationFunction) => void;
  setWeightInit: (weightInit: WeightInitStrategy) => void;
  setUseBias: (useBias: boolean) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  locale: 'pt-BR',
  activeLevelId: 1,
  unlockedUpToLevel: 1,
  starsByLevel: {},
  lastTrainingLoss: INITIAL_LOSS_L1,
  topology: LEVEL1.idealTopology,
  parameters: INITIAL_PARAMS_L1,
  learningRate: 0.3,
  epochs: 180,
  activation: LEVEL1.defaultActivation,
  weightInit: 'deterministic',
  useBias: true,
  setLocale: (locale) => set({ locale }),
  setActiveLevelId: async (activeLevelId) => {
    const level = getLevelByNumber(activeLevelId);
    trackAnalyticsEvent('level_start', { levelId: level.id, levelNumber: activeLevelId });
    const untunedParams = getUntunedParametersForLevel(activeLevelId);
    const initialLoss = evaluateDatasetLoss(level.idealTopology, untunedParams, level.dataset, {
      useBias: true,
      outputActivation: level.defaultActivation,
    });
    set({
      activeLevelId,
      topology: level.idealTopology,
      parameters: untunedParams,
      activation: level.defaultActivation,
      lastTrainingLoss: initialLoss,
    });
  },
  loadIdealNetworkForLevel: (level) => {
    const untunedParams = getUntunedParametersForLevel(level.levelNumber);
    const initialLoss = evaluateDatasetLoss(level.idealTopology, untunedParams, level.dataset, {
      useBias: true,
      outputActivation: level.defaultActivation,
    });
    set({
      topology: level.idealTopology,
      parameters: untunedParams,
      activation: level.defaultActivation,
      lastTrainingLoss: initialLoss,
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

      trackAnalyticsEvent('level_complete', {
        levelId: level.id,
        stars: bestStars,
        finalLoss: Number(effectiveLoss.toFixed(4)),
      });
    }
    return stars;
  },
  setLastTrainingLoss: (lastTrainingLoss) => set({ lastTrainingLoss }),
  setTopology: (topology) =>
    set((state) => {
      const level = getLevelByNumber(state.activeLevelId);
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
      const nextLoss = evaluateDatasetLoss(topology, nextParams, level.dataset, {
        useBias: state.useBias,
        outputActivation: state.activation,
      });
      return { topology, parameters: nextParams, lastTrainingLoss: nextLoss };
    }),
  setParameters: (parameters) =>
    set((state) => {
      const level = getLevelByNumber(state.activeLevelId);
      const nextLoss = evaluateDatasetLoss(state.topology, parameters, level.dataset, {
        useBias: state.useBias,
        outputActivation: state.activation,
      });
      return { parameters, lastTrainingLoss: nextLoss };
    }),
  setLearningRate: (learningRate) => set({ learningRate }),
  setEpochs: (epochs) => set({ epochs }),
  setActivation: (activation) =>
    set((state) => {
      const level = getLevelByNumber(state.activeLevelId);
      const nextTopology = {
        ...state.topology,
        hidden: state.topology.hidden.map((layer) =>
          layer.map((n) => ({ ...n, activation })),
        ),
      };
      const nextLoss = evaluateDatasetLoss(nextTopology, state.parameters, level.dataset, {
        useBias: state.useBias,
        outputActivation: activation,
      });
      return {
        activation,
        topology: nextTopology,
        lastTrainingLoss: nextLoss,
      };
    }),
  setWeightInit: (weightInit) => set({ weightInit }),
  setUseBias: (useBias) =>
    set((state) => {
      const level = getLevelByNumber(state.activeLevelId);
      const nextLoss = evaluateDatasetLoss(state.topology, state.parameters, level.dataset, {
        useBias,
        outputActivation: state.activation,
      });
      return { useBias, lastTrainingLoss: nextLoss };
    }),
}));
