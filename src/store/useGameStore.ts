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
  initializeNetworkParameters,
} from '../core/nn-core';

const INITIAL_TOPOLOGY: NetworkTopology = {
  inputs: ['dist_front', 'floor_light'],
  hidden: [
    [
      { id: 'h1', activation: 'relu' },
      { id: 'h2', activation: 'relu' },
    ],
  ],
  outputs: ['jump'],
  links: [
    ['dist_front', 'h1'],
    ['floor_light', 'h2'],
    ['h1', 'jump'],
    ['h2', 'jump'],
  ],
};

export interface GameState {
  locale: Locale;
  activeLevelId: number;
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
  activeLevelId: 4,
  authSession: null,
  topology: INITIAL_TOPOLOGY,
  parameters: initializeNetworkParameters(INITIAL_TOPOLOGY, 'deterministic', 42),
  learningRate: 0.25,
  epochs: 120,
  activation: 'relu',
  weightInit: 'deterministic',
  useBias: true,
  setLocale: (locale) => set({ locale }),
  setActiveLevelId: (activeLevelId) => set({ activeLevelId }),
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
