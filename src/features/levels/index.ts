import { NetworkParameters } from '../../core/nn-core';
import { LEVELS, LevelDefinition, getLevelById, getLevelByNumber } from '../../levels';

export const LEVELS_FEATURE_ID = 'levels';

export { LEVELS, getLevelById, getLevelByNumber };
export type { LevelDefinition };

/**
 * Retorna pesos convergidos de referência para a rede ideal de cada fase,
 * garantindo que tanto o treino via TF.js quanto o carregamento da rede ideal superem o desafio com 3 estrelas.
 */
export function getIdealParametersForLevel(levelNumber: number): NetworkParameters {
  switch (levelNumber) {
    case 1:
      return {
        linkWeights: { 'dist_front->jump': 2.6 },
        biases: { jump: -1.0 },
      };
    case 2:
      return {
        linkWeights: {
          'dist_front->jump': 4.5,
          'floor_light->jump': 4.5,
        },
        biases: { jump: -2.0 },
      };
    case 3:
      return {
        linkWeights: {
          'dist_front->h1': 1.2,
          'dist_left->h1': 1.0,
          'dist_right->h1': 1.0,
          'dist_front->h2': 1.2,
          'dist_left->h2': 1.0,
          'dist_right->h2': 1.0,
          'dist_front->h3': 0.2,
          'dist_left->h3': -2.8,
          'dist_right->h3': 2.8,
          'dist_front->h4': 0.2,
          'dist_left->h4': 2.8,
          'dist_right->h4': -2.8,
          'h1->walk': 2.5,
          'h2->walk': 2.5,
          'h3->turn_left': 3.2,
          'h4->turn_right': 3.2,
          'h1->turn_left': -0.5,
          'h2->turn_right': -0.5,
        },
        biases: {
          h1: 0.5,
          h2: 0.5,
          h3: -0.4,
          h4: -0.4,
          walk: 1.5,
          turn_left: -1.8,
          turn_right: -1.8,
        },
      };
    case 4:
      return {
        linkWeights: {
          'dist_front->h1': 3.5,
          'floor_light->h1': 3.5,
          'dist_front->h2': 3.5,
          'floor_light->h2': 3.5,
          'h1->jump': 4.5,
          'h2->jump': -4.5,
        },
        biases: {
          h1: -1.5,
          h2: -5.2,
          jump: -4.0,
        },
      };
    case 5:
    default:
      return {
        linkWeights: {
          'dist_front->h1': 1.2,
          'dist_left->h2': 2.0,
          'dist_right->h3': 2.0,
          'target_angle->h4': 0.5,
          'dist_front->h5': 1.2,
          'target_angle->h6': -0.5,
          'h1->walk': 2.5,
          'h2->turn_right': 1.8,
          'h3->turn_left': 1.8,
          'h4->turn_right': 0.5,
          'h5->walk': 2.5,
          'h6->turn_left': 0.5,
        },
        biases: {
          h1: 0.8,
          h2: -1.0,
          h3: -1.0,
          h4: -1.5,
          h5: 0.8,
          h6: -1.5,
          walk: 2.0,
          turn_left: -1.8,
          turn_right: -1.8,
        },
      };
  }
}
