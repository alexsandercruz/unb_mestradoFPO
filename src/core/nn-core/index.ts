export type ActivationFunction = 'step' | 'sigmoid' | 'relu' | 'tanh';

export type WeightInitStrategy = 'deterministic' | 'random' | 'zeros' | 'xavier';

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

export interface NetworkParameters {
  linkWeights: Record<string, number>;
  biases: Record<string, number>;
}

export interface NeuronActivationState {
  id: string;
  weightedSum: number;
  output: number;
  activation: ActivationFunction | 'linear';
}

export interface ForwardPassResult {
  outputs: Record<string, number>;
  neurons: Record<string, NeuronActivationState>;
}

export interface ForwardPassOptions {
  useBias?: boolean;
  outputActivation?: ActivationFunction;
}

export interface TrainingHyperparams {
  learningRate: number;
  epochs: number;
  activation: ActivationFunction;
  useBias: boolean;
  weightInit?: WeightInitStrategy;
  seed?: number;
}

export interface DatasetSample {
  inputs: number[];
  targets: number[];
}

export function getLinkKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export function countHiddenNeurons(topology: NetworkTopology): number {
  return topology.hidden.reduce((sum, layer) => sum + layer.length, 0);
}

export function countTotalTrainableNeurons(topology: NetworkTopology): number {
  return countHiddenNeurons(topology) + topology.outputs.length;
}

/**
 * Gerador pseudoaleatório determinístico Mulberry32 para inicialização reproduzível.
 */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function evaluateActivation(value: number, activation: ActivationFunction): number {
  switch (activation) {
    case 'step':
      return value >= 0 ? 1 : 0;
    case 'sigmoid': {
      const clamped = Math.max(-30, Math.min(30, value));
      return 1 / (1 + Math.exp(-clamped));
    }
    case 'relu':
      return value > 0 ? value : 0;
    case 'tanh':
      return Math.tanh(value);
  }
}

/**
 * Derivada da função de ativação usada no backpropagation.
 * Para 'step', usa a derivada suave (surrogate gradient da sigmoide) para permitir aprendizado.
 */
export function evaluateActivationDerivative(
  weightedSum: number,
  activatedOutput: number,
  activation: ActivationFunction,
): number {
  switch (activation) {
    case 'step': {
      const s = evaluateActivation(weightedSum, 'sigmoid');
      return Math.max(0.05, s * (1 - s));
    }
    case 'sigmoid':
      return Math.max(0.02, activatedOutput * (1 - activatedOutput));
    case 'relu':
      return weightedSum > 0 ? 1 : 0.05;
    case 'tanh':
      return Math.max(0.02, 1 - activatedOutput * activatedOutput);
  }
}

export function getAllBiasNodeIds(topology: NetworkTopology): string[] {
  const ids: string[] = [];
  for (const layer of topology.hidden) {
    for (const neuron of layer) {
      ids.push(neuron.id);
    }
  }
  for (const outId of topology.outputs) {
    ids.push(outId);
  }
  return ids;
}

export function initializeNetworkParameters(
  topology: NetworkTopology,
  strategy: WeightInitStrategy = 'deterministic',
  seed = 42,
): NetworkParameters {
  const rng = createSeededRng(seed);
  const linkWeights: Record<string, number> = {};
  const biases: Record<string, number> = {};

  const fanIn = Math.max(1, topology.inputs.length);
  const fanOut = Math.max(1, topology.outputs.length);
  const xavierScale = Math.sqrt(6 / (fanIn + fanOut));

  const hiddenIndexMap = new Map<string, number>();
  topology.hidden.forEach((layer) => {
    layer.forEach((n, idx) => {
      hiddenIndexMap.set(n.id, idx);
    });
  });

  topology.links.forEach(([from, to], idx) => {
    const key = getLinkKey(from, to);
    if (strategy === 'zeros') {
      linkWeights[key] = 0;
    } else if (strategy === 'xavier') {
      linkWeights[key] = Number(((rng() * 2 - 1) * xavierScale).toFixed(4));
    } else {
      const toHiddenIdx = hiddenIndexMap.get(to);
      const fromHiddenIdx = hiddenIndexMap.get(from);
      const jitter = (rng() - 0.5) * 0.3;

      if (toHiddenIdx !== undefined) {
        // Ligações para camada oculta começam positivas com leve variação para separar hiperplanos (OR vs AND)
        linkWeights[key] = Number((1.25 + toHiddenIdx * 0.15 + jitter).toFixed(4));
      } else if (fromHiddenIdx !== undefined) {
        // Ligações da camada oculta para a saída alternam sinais (+ e -) para evitar mínimo local em XOR
        const sign = fromHiddenIdx % 2 === 0 ? 1 : -1;
        linkWeights[key] = Number((sign * (1.6 + Math.abs(jitter))).toFixed(4));
      } else {
        const val = 0.8 + (idx % 2 === 0 ? 0.2 : -0.2) + jitter;
        linkWeights[key] = Number(val.toFixed(4));
      }
    }
  });

  const biasNodes = getAllBiasNodeIds(topology);
  biasNodes.forEach((nodeId) => {
    if (strategy === 'zeros') {
      biases[nodeId] = 0;
    } else {
      const hiddenIdx = hiddenIndexMap.get(nodeId);
      const jitter = (rng() - 0.5) * 0.15;
      if (hiddenIdx !== undefined) {
        // Limiares escalonados (-0.6, -1.7, ...) quebram simetria entre neurônios ocultos
        biases[nodeId] = Number((-0.6 - hiddenIdx * 1.1 + jitter).toFixed(4));
      } else {
        biases[nodeId] = Number((-0.4 + jitter).toFixed(4));
      }
    }
  });

  return { linkWeights, biases };
}

export function serializeParameters(
  topology: NetworkTopology,
  params: NetworkParameters,
): number[] {
  const flat: number[] = [];
  for (const [from, to] of topology.links) {
    const key = getLinkKey(from, to);
    flat.push(params.linkWeights[key] ?? 0);
  }
  for (const nodeId of getAllBiasNodeIds(topology)) {
    flat.push(params.biases[nodeId] ?? 0);
  }
  return flat;
}

export function deserializeParameters(
  topology: NetworkTopology,
  flatWeights: number[],
): NetworkParameters {
  const linkWeights: Record<string, number> = {};
  const biases: Record<string, number> = {};
  let cursor = 0;

  for (const [from, to] of topology.links) {
    const key = getLinkKey(from, to);
    linkWeights[key] = flatWeights[cursor] ?? 0;
    cursor += 1;
  }

  for (const nodeId of getAllBiasNodeIds(topology)) {
    biases[nodeId] = flatWeights[cursor] ?? 0;
    cursor += 1;
  }

  return { linkWeights, biases };
}

/**
 * Forward pass puro em TypeScript (sem dependência de React ou TF.js).
 * Calcula a soma ponderada e a ativação de cada neurônio para inspeção em tempo real (RF-06) e execução na arena.
 */
export function forwardPass(
  topology: NetworkTopology,
  params: NetworkParameters,
  inputMap: Record<string, number>,
  options: ForwardPassOptions = {},
): ForwardPassResult {
  const useBias = options.useBias ?? true;
  const outputActivation = options.outputActivation ?? 'sigmoid';

  const neurons: Record<string, NeuronActivationState> = {};
  const incomingMap = new Map<string, string[]>();

  for (const [from, to] of topology.links) {
    const list = incomingMap.get(to) ?? [];
    list.push(from);
    incomingMap.set(to, list);
  }

  // 1. Camada de entrada (sensores)
  for (const inputId of topology.inputs) {
    const val = inputMap[inputId] ?? 0;
    neurons[inputId] = {
      id: inputId,
      weightedSum: val,
      output: val,
      activation: 'linear',
    };
  }

  // 2. Camadas ocultas (em ordem topológica de camadas)
  for (const layer of topology.hidden) {
    for (const hiddenNeuron of layer) {
      const incoming = incomingMap.get(hiddenNeuron.id) ?? [];
      let sum = useBias ? (params.biases[hiddenNeuron.id] ?? 0) : 0;
      for (const fromId of incoming) {
        const sourceOut = neurons[fromId]?.output ?? 0;
        const weight = params.linkWeights[getLinkKey(fromId, hiddenNeuron.id)] ?? 0;
        sum += sourceOut * weight;
      }
      const activated = evaluateActivation(sum, hiddenNeuron.activation);
      neurons[hiddenNeuron.id] = {
        id: hiddenNeuron.id,
        weightedSum: sum,
        output: activated,
        activation: hiddenNeuron.activation,
      };
    }
  }

  // 3. Camada de saída (ações)
  const outputs: Record<string, number> = {};
  for (const outId of topology.outputs) {
    const incoming = incomingMap.get(outId) ?? [];
    let sum = useBias ? (params.biases[outId] ?? 0) : 0;
    for (const fromId of incoming) {
      const sourceOut = neurons[fromId]?.output ?? 0;
      const weight = params.linkWeights[getLinkKey(fromId, outId)] ?? 0;
      sum += sourceOut * weight;
    }
    const activated = evaluateActivation(sum, outputActivation);
    neurons[outId] = {
      id: outId,
      weightedSum: sum,
      output: activated,
      activation: outputActivation,
    };
    outputs[outId] = activated;
  }

  return { outputs, neurons };
}
