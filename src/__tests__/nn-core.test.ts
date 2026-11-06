import { describe, it, expect } from 'vitest';
import {
  NetworkTopology,
  DatasetSample,
  forwardPass,
  serializeParameters,
  deserializeParameters,
  initializeNetworkParameters,
  countTotalTrainableNeurons,
} from '../core/nn-core';
import { convertTopologyToTfModel, trainTopologyWithTfjs } from '../core/nn-core/tfAdapter';

const LOGIC_GATE_TOPOLOGY_2_1: NetworkTopology = {
  inputs: ['in1', 'in2'],
  hidden: [],
  outputs: ['out'],
  links: [
    ['in1', 'out'],
    ['in2', 'out'],
  ],
};

const XOR_TOPOLOGY_2_2_1: NetworkTopology = {
  inputs: ['in1', 'in2'],
  hidden: [
    [
      { id: 'h1', activation: 'tanh' },
      { id: 'h2', activation: 'tanh' },
    ],
  ],
  outputs: ['out'],
  links: [
    ['in1', 'h1'],
    ['in2', 'h1'],
    ['in1', 'h2'],
    ['in2', 'h2'],
    ['h1', 'out'],
    ['h2', 'out'],
  ],
};

const AND_DATASET: DatasetSample[] = [
  { inputs: [0, 0], targets: [0] },
  { inputs: [0, 1], targets: [0] },
  { inputs: [1, 0], targets: [0] },
  { inputs: [1, 1], targets: [1] },
];

const OR_DATASET: DatasetSample[] = [
  { inputs: [0, 0], targets: [0] },
  { inputs: [0, 1], targets: [1] },
  { inputs: [1, 0], targets: [1] },
  { inputs: [1, 1], targets: [1] },
];

const XOR_DATASET: DatasetSample[] = [
  { inputs: [0, 0], targets: [0] },
  { inputs: [0, 1], targets: [1] },
  { inputs: [1, 0], targets: [1] },
  { inputs: [1, 1], targets: [0] },
];

describe('T3 nn-core — Pure TS Forward Pass, Serialization & TF.js Convergence', () => {
  it('computes pure TS forward pass with weightedSum and activation outputs', () => {
    const params = {
      linkWeights: { 'in1->out': 1.0, 'in2->out': 1.0 },
      biases: { out: -1.5 },
    };

    const resFalse = forwardPass(
      LOGIC_GATE_TOPOLOGY_2_1,
      params,
      { in1: 1, in2: 0 },
      { useBias: true, outputActivation: 'step' },
    );
    expect(resFalse.neurons.out.weightedSum).toBeCloseTo(-0.5, 5);
    expect(resFalse.outputs.out).toBe(0);

    const resTrue = forwardPass(
      LOGIC_GATE_TOPOLOGY_2_1,
      params,
      { in1: 1, in2: 1 },
      { useBias: true, outputActivation: 'step' },
    );
    expect(resTrue.neurons.out.weightedSum).toBeCloseTo(0.5, 5);
    expect(resTrue.outputs.out).toBe(1);
  });

  it('serializes and deserializes parameters deterministically and converts to TF.js LayersModel', () => {
    const initParams = initializeNetworkParameters(XOR_TOPOLOGY_2_2_1, 'xavier', 123);
    const serialized = serializeParameters(XOR_TOPOLOGY_2_2_1, initParams);
    const restored = deserializeParameters(XOR_TOPOLOGY_2_2_1, serialized);

    expect(restored.linkWeights['in1->h1']).toBeCloseTo(initParams.linkWeights['in1->h1'], 4);
    expect(countTotalTrainableNeurons(XOR_TOPOLOGY_2_2_1)).toBe(3);

    const tfModel = convertTopologyToTfModel(XOR_TOPOLOGY_2_2_1, restored, {
      useBias: true,
      outputActivation: 'sigmoid',
    });
    expect(tfModel.layers.length).toBe(2);
    tfModel.dispose();
  });

  it('converges AND gate with loss < 0.05', async () => {
    const res = await trainTopologyWithTfjs(LOGIC_GATE_TOPOLOGY_2_1, AND_DATASET, {
      learningRate: 0.4,
      epochs: 200,
      activation: 'sigmoid',
      useBias: true,
      seed: 42,
    });

    expect(res.finalLoss).toBeLessThan(0.05);

    const out00 = forwardPass(LOGIC_GATE_TOPOLOGY_2_1, res.parameters, { in1: 0, in2: 0 }).outputs
      .out;
    const out11 = forwardPass(LOGIC_GATE_TOPOLOGY_2_1, res.parameters, { in1: 1, in2: 1 }).outputs
      .out;
    expect(out00).toBeLessThan(0.25);
    expect(out11).toBeGreaterThan(0.75);
  });

  it('converges OR gate with loss < 0.05', async () => {
    const res = await trainTopologyWithTfjs(LOGIC_GATE_TOPOLOGY_2_1, OR_DATASET, {
      learningRate: 0.4,
      epochs: 200,
      activation: 'sigmoid',
      useBias: true,
      seed: 42,
    });

    expect(res.finalLoss).toBeLessThan(0.05);

    const out00 = forwardPass(LOGIC_GATE_TOPOLOGY_2_1, res.parameters, { in1: 0, in2: 0 }).outputs
      .out;
    const out01 = forwardPass(LOGIC_GATE_TOPOLOGY_2_1, res.parameters, { in1: 0, in2: 1 }).outputs
      .out;
    expect(out00).toBeLessThan(0.25);
    expect(out01).toBeGreaterThan(0.75);
  });

  it('converges XOR gate (2->2->1) with loss < 0.05', async () => {
    const res = await trainTopologyWithTfjs(XOR_TOPOLOGY_2_2_1, XOR_DATASET, {
      learningRate: 0.5,
      epochs: 350,
      activation: 'tanh',
      useBias: true,
      seed: 7,
    });

    expect(res.finalLoss).toBeLessThan(0.05);

    const p00 = forwardPass(XOR_TOPOLOGY_2_2_1, res.parameters, { in1: 0, in2: 0 }).outputs.out;
    const p01 = forwardPass(XOR_TOPOLOGY_2_2_1, res.parameters, { in1: 0, in2: 1 }).outputs.out;
    const p10 = forwardPass(XOR_TOPOLOGY_2_2_1, res.parameters, { in1: 1, in2: 0 }).outputs.out;
    const p11 = forwardPass(XOR_TOPOLOGY_2_2_1, res.parameters, { in1: 1, in2: 1 }).outputs.out;

    expect(p00).toBeLessThan(0.25);
    expect(p01).toBeGreaterThan(0.75);
    expect(p10).toBeGreaterThan(0.75);
    expect(p11).toBeLessThan(0.25);
  });
});

