export type ActivationFunction = 'step' | 'sigmoid' | 'relu' | 'tanh';

export interface HiddenNeuron {
  id: string;
  activation: ActivationFunction;
}

export interface NetworkTopology {
  inputs: string[];
  hidden: HiddenNeuron[][];
  outputs: string[];
  links: [string, string][];
}

export function countHiddenNeurons(topology: NetworkTopology): number {
  return topology.hidden.reduce((sum, layer) => sum + layer.length, 0);
}

