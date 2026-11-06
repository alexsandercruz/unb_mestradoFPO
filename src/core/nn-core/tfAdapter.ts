import * as tf from '@tensorflow/tfjs';
import {
  ActivationFunction,
  DatasetSample,
  ForwardPassOptions,
  NetworkParameters,
  NetworkTopology,
  TrainingHyperparams,
  evaluateActivationDerivative,
  forwardPass,
  getAllBiasNodeIds,
  getLinkKey,
  initializeNetworkParameters,
} from './index';

// Usa backend CPU por padrão em workers/testes para evitar avisos de WebGL em ambientes sem canvas GPU
try {
  void tf.setBackend('cpu');
} catch {
  // ignore
}

export interface TrainStepResult {
  epoch: number;
  loss: number;
  parameters: NetworkParameters;
}

export interface TrainRunResult {
  finalLoss: number;
  history: { epoch: number; loss: number }[];
  parameters: NetworkParameters;
}

function mapTfActivation(
  activation: ActivationFunction,
): 'sigmoid' | 'relu' | 'tanh' | 'linear' {
  switch (activation) {
    case 'step':
    case 'sigmoid':
      return 'sigmoid';
    case 'relu':
      return 'relu';
    case 'tanh':
      return 'tanh';
  }
}

/**
 * Converte uma NetworkTopology para um tf.LayersModel do TensorFlow.js
 * sincronizando os pesos e biases das camadas conectadas.
 */
export function convertTopologyToTfModel(
  topology: NetworkTopology,
  params: NetworkParameters,
  options: ForwardPassOptions = {},
): tf.LayersModel {
  const useBias = options.useBias ?? true;
  const outputActivation = options.outputActivation ?? 'sigmoid';

  const model = tf.sequential();
  let prevLayerIds = [...topology.inputs];

  topology.hidden.forEach((layer, layerIndex) => {
    if (layer.length === 0) return;
    const layerIds = layer.map((n) => n.id);
    const act = mapTfActivation(layer[0].activation);

    const dense = tf.layers.dense({
      units: layer.length,
      inputShape: layerIndex === 0 ? [prevLayerIds.length] : undefined,
      activation: act,
      useBias,
    });
    model.add(dense);

    const kernelValues = new Float32Array(prevLayerIds.length * layerIds.length);
    prevLayerIds.forEach((fromId, r) => {
      layerIds.forEach((toId, c) => {
        kernelValues[r * layerIds.length + c] = params.linkWeights[getLinkKey(fromId, toId)] ?? 0;
      });
    });

    const kernelTensor = tf.tensor2d(kernelValues, [prevLayerIds.length, layerIds.length]);
    if (useBias) {
      const biasValues = new Float32Array(layerIds.map((id) => params.biases[id] ?? 0));
      const biasTensor = tf.tensor1d(biasValues);
      dense.setWeights([kernelTensor, biasTensor]);
      biasTensor.dispose();
    } else {
      dense.setWeights([kernelTensor]);
    }
    kernelTensor.dispose();

    prevLayerIds = layerIds;
  });

  const outIds = [...topology.outputs];
  const outDense = tf.layers.dense({
    units: outIds.length,
    inputShape: topology.hidden.every((l) => l.length === 0) ? [prevLayerIds.length] : undefined,
    activation: mapTfActivation(outputActivation),
    useBias,
  });
  model.add(outDense);

  const outKernelValues = new Float32Array(prevLayerIds.length * outIds.length);
  prevLayerIds.forEach((fromId, r) => {
    outIds.forEach((toId, c) => {
      outKernelValues[r * outIds.length + c] = params.linkWeights[getLinkKey(fromId, toId)] ?? 0;
    });
  });

  const outKernelTensor = tf.tensor2d(outKernelValues, [prevLayerIds.length, outIds.length]);
  if (useBias) {
    const outBiasValues = new Float32Array(outIds.map((id) => params.biases[id] ?? 0));
    const outBiasTensor = tf.tensor1d(outBiasValues);
    outDense.setWeights([outKernelTensor, outBiasTensor]);
    outBiasTensor.dispose();
  } else {
    outDense.setWeights([outKernelTensor]);
  }
  outKernelTensor.dispose();

  return model;
}

/**
 * Executa uma época de backpropagation com suporte a qualquer grafo acíclico de links do editor
 * e cálculo de loss via tensores do TensorFlow.js.
 */
export function runBackpropEpoch(
  topology: NetworkTopology,
  params: NetworkParameters,
  dataset: DatasetSample[],
  hyperparams: TrainingHyperparams,
  momentumState?: {
    vWeights: Record<string, number>;
    vBiases: Record<string, number>;
  },
): { nextParams: NetworkParameters; loss: number } {
  const { learningRate, activation, useBias } = hyperparams;
  const outputActivation: ActivationFunction = activation === 'step' ? 'sigmoid' : 'sigmoid';

  const gradWeights: Record<string, number> = {};
  const gradBiases: Record<string, number> = {};

  for (const [from, to] of topology.links) {
    gradWeights[getLinkKey(from, to)] = 0;
  }
  for (const nodeId of getAllBiasNodeIds(topology)) {
    gradBiases[nodeId] = 0;
  }

  const predictionsBatch: number[][] = [];
  const targetsBatch: number[][] = [];

  const outgoingMap = new Map<string, string[]>();
  for (const [from, to] of topology.links) {
    const list = outgoingMap.get(from) ?? [];
    list.push(to);
    outgoingMap.set(from, list);
  }

  for (const sample of dataset) {
    const inputMap: Record<string, number> = {};
    topology.inputs.forEach((id, i) => {
      inputMap[id] = sample.inputs[i] ?? 0;
    });

    const effectiveTopology: NetworkTopology = {
      ...topology,
      hidden: topology.hidden.map((layer) =>
        layer.map((n) => ({
          ...n,
          activation: hyperparams.activation,
        })),
      ),
    };

    const result = forwardPass(effectiveTopology, params, inputMap, {
      useBias,
      outputActivation,
    });

    const predRow: number[] = [];
    const targetRow: number[] = [];
    const deltas: Record<string, number> = {};

    topology.outputs.forEach((outId, idx) => {
      const target = sample.targets[idx] ?? 0;
      const neuron = result.neurons[outId];
      const pred = neuron?.output ?? 0;
      predRow.push(pred);
      targetRow.push(target);

      const error = pred - target;
      const deriv = evaluateActivationDerivative(
        neuron?.weightedSum ?? 0,
        pred,
        outputActivation,
      );
      deltas[outId] = error * deriv;
    });

    predictionsBatch.push(predRow);
    targetsBatch.push(targetRow);

    for (let l = effectiveTopology.hidden.length - 1; l >= 0; l--) {
      const layer = effectiveTopology.hidden[l];
      for (const hiddenNeuron of layer) {
        const downstreamIds = outgoingMap.get(hiddenNeuron.id) ?? [];
        let downstreamSum = 0;
        for (const toId of downstreamIds) {
          const w = params.linkWeights[getLinkKey(hiddenNeuron.id, toId)] ?? 0;
          downstreamSum += w * (deltas[toId] ?? 0);
        }
        const neuronState = result.neurons[hiddenNeuron.id];
        const deriv = evaluateActivationDerivative(
          neuronState?.weightedSum ?? 0,
          neuronState?.output ?? 0,
          hiddenNeuron.activation,
        );
        deltas[hiddenNeuron.id] = downstreamSum * deriv;
      }
    }

    for (const [from, to] of topology.links) {
      const key = getLinkKey(from, to);
      const sourceOut = result.neurons[from]?.output ?? 0;
      gradWeights[key] += (deltas[to] ?? 0) * sourceOut;
    }

    if (useBias) {
      for (const nodeId of getAllBiasNodeIds(topology)) {
        gradBiases[nodeId] += deltas[nodeId] ?? 0;
      }
    }
  }

  const loss = tf.tidy(() => {
    const predTensor = tf.tensor2d(predictionsBatch);
    const targetTensor = tf.tensor2d(targetsBatch);
    const mse = tf.losses.meanSquaredError(targetTensor, predTensor);
    return mse.dataSync()[0];
  });

  const n = Math.max(1, dataset.length);
  const momentum = 0.8;
  const effectiveLr = Math.min(3.0, learningRate * 5.0);

  const nextWeights: Record<string, number> = {};
  const nextBiases: Record<string, number> = {};

  for (const [from, to] of topology.links) {
    const key = getLinkKey(from, to);
    const g = gradWeights[key] / n;
    const prevV = momentumState?.vWeights[key] ?? 0;
    const v = momentum * prevV - effectiveLr * g;
    if (momentumState) {
      momentumState.vWeights[key] = v;
    }
    nextWeights[key] = (params.linkWeights[key] ?? 0) + v;
  }

  for (const nodeId of getAllBiasNodeIds(topology)) {
    if (useBias) {
      const g = gradBiases[nodeId] / n;
      const prevV = momentumState?.vBiases[nodeId] ?? 0;
      const v = momentum * prevV - effectiveLr * g;
      if (momentumState) {
        momentumState.vBiases[nodeId] = v;
      }
      nextBiases[nodeId] = (params.biases[nodeId] ?? 0) + v;
    } else {
      nextBiases[nodeId] = 0;
    }
  }

  return {
    nextParams: { linkWeights: nextWeights, biases: nextBiases },
    loss,
  };
}

/**
 * Treina uma topologia completa por N épocas retornando o histórico de loss e parâmetros finais.
 */
export async function trainTopologyWithTfjs(
  topology: NetworkTopology,
  dataset: DatasetSample[],
  hyperparams: TrainingHyperparams,
  initialParams?: NetworkParameters,
  onEpoch?: (step: TrainStepResult) => void | Promise<void>,
): Promise<TrainRunResult> {
  let currentParams =
    initialParams ??
    initializeNetworkParameters(
      topology,
      hyperparams.weightInit ?? 'deterministic',
      hyperparams.seed ?? 42,
    );

  const momentumState = {
    vWeights: {} as Record<string, number>,
    vBiases: {} as Record<string, number>,
  };

  const history: { epoch: number; loss: number }[] = [];
  let finalLoss = 1;

  for (let epoch = 1; epoch <= hyperparams.epochs; epoch++) {
    const { nextParams, loss } = runBackpropEpoch(
      topology,
      currentParams,
      dataset,
      hyperparams,
      momentumState,
    );
    currentParams = nextParams;
    finalLoss = loss;
    history.push({ epoch, loss });

    if (onEpoch) {
      await onEpoch({ epoch, loss, parameters: currentParams });
    }
  }

  return {
    finalLoss,
    history,
    parameters: currentParams,
  };
}
