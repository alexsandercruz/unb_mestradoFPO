import level01 from './01-first-step.json';
import level02 from './02-logic-gate.json';
import level03 from './03-corridor.json';
import level04 from './04-xor.json';
import level05 from './05-maze.json';
import { ActivationFunction, DatasetSample, NetworkTopology } from '../core/nn-core';
import { ArenaMapConfig } from '../core/simulation';

export interface LevelDefinition {
  id: string;
  levelNumber: number;
  title: { 'pt-BR': string; en: string };
  challenge: { 'pt-BR': string; en: string };
  concept: { 'pt-BR': string; en: string };
  allowedInputs: string[];
  allowedOutputs: string[];
  maxHiddenLayers: number;
  maxHiddenNeurons: number;
  idealHiddenNeurons: number;
  defaultActivation: ActivationFunction;
  targetLoss: number;
  idealTopology: NetworkTopology;
  dataset: DatasetSample[];
  rewardRules?: {
    reachGoal: number;
    stepAlive: number;
    collisionPenalty: number;
  };
  arena: ArenaMapConfig;
  tutorial: { 'pt-BR': string[]; en: string[] };
}

export const LEVELS: LevelDefinition[] = [
  level01 as unknown as LevelDefinition,
  level02 as unknown as LevelDefinition,
  level03 as unknown as LevelDefinition,
  level04 as unknown as LevelDefinition,
  level05 as unknown as LevelDefinition,
];

export const LEVEL_IDS = LEVELS.map((l) => l.id);

export function getLevelByNumber(levelNumber: number): LevelDefinition {
  return LEVELS.find((l) => l.levelNumber === levelNumber) ?? LEVELS[0];
}

export function getLevelById(levelId: string): LevelDefinition {
  return LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
}
