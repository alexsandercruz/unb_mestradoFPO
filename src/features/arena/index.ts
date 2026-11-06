import {
  ArenaMapConfig,
  DEFAULT_ARENA_MAP,
  SimulationEpisodeResult,
  runSimulationEpisode,
} from '../../core/simulation';

export const ARENA_FEATURE_ID = 'arena';
export type PlaybackSpeed = 0.5 | 1 | 4;

export { DEFAULT_ARENA_MAP, runSimulationEpisode };
export type { ArenaMapConfig, SimulationEpisodeResult };
