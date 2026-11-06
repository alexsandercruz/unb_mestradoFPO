export interface SimulationConfig {
  seed: number;
  tickRateHz: number;
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  seed: 42,
  tickRateHz: 30,
};

