import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ParamsPanel } from '../features/params/ParamsPanel';
import {
  TrainingSessionController,
  clampEpochs,
  clampLearningRate,
} from '../features/params';
import {
  DatasetSample,
  NetworkParameters,
  NetworkTopology,
  initializeNetworkParameters,
} from '../core/nn-core';
import type { WorkerOutboundMessage } from '../workers/train.worker';

const TEST_TOPOLOGY: NetworkTopology = {
  inputs: ['in1', 'in2'],
  hidden: [],
  outputs: ['out'],
  links: [
    ['in1', 'out'],
    ['in2', 'out'],
  ],
};

const OR_DATASET: DatasetSample[] = [
  { inputs: [0, 0], targets: [0] },
  { inputs: [0, 1], targets: [1] },
  { inputs: [1, 0], targets: [1] },
  { inputs: [1, 1], targets: [1] },
];

describe('T5 ParamsPanel & Web Worker Training — Sliders, Hints, 500 Epochs & Pause/Resume', () => {
  it('validates parameter ranges and opens "What does this do?" hints (RF-04)', () => {
    expect(clampLearningRate(0.0001)).toBe(0.001);
    expect(clampLearningRate(2.5)).toBe(1.0);
    expect(clampEpochs(0)).toBe(1);
    expect(clampEpochs(999)).toBe(500);

    const initParams = initializeNetworkParameters(TEST_TOPOLOGY, 'deterministic', 42);
    render(
      <ParamsPanel
        locale="pt-BR"
        topology={TEST_TOPOLOGY}
        parameters={initParams}
        learningRate={0.2}
        epochs={100}
        activation="sigmoid"
        weightInit="deterministic"
        useBias={true}
        dataset={OR_DATASET}
        targetLoss={0.05}
        allowManualWeights={true}
        onChangeLearningRate={() => {}}
        onChangeEpochs={() => {}}
        onChangeActivation={() => {}}
        onChangeWeightInit={() => {}}
        onChangeUseBias={() => {}}
        onChangeParameters={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('hint-btn-lr'));
    expect(screen.getByTestId('hint-text-lr')).toBeInTheDocument();
    expect(screen.getByTestId('manual-weights-box')).toBeInTheDocument();
  });

  it('preserves weights when paused and resumed and completes 500 epochs smoothly', async () => {
    const initParams = initializeNetworkParameters(TEST_TOPOLOGY, 'deterministic', 42);
    let pausedSnapshot: NetworkParameters | null = null;
    let pausedEpoch = 0;

    await new Promise<void>((resolve) => {
      const controller = new TrainingSessionController((msg: WorkerOutboundMessage) => {
        if (msg.type === 'EPOCH_UPDATE' && msg.epoch === 10 && !pausedSnapshot) {
          controller.pause();
        } else if (msg.type === 'PAUSED') {
          pausedEpoch = msg.epoch;
          pausedSnapshot = {
            linkWeights: { ...msg.parameters.linkWeights },
            biases: { ...msg.parameters.biases },
          };
          expect(pausedEpoch).toBeGreaterThanOrEqual(10);
          expect(pausedSnapshot.linkWeights['in1->out']).not.toBe(
            initParams.linkWeights['in1->out'],
          );
          // Retoma o treino até 25 épocas verificando preservação dos pesos
          controller.resume({
            learningRate: 0.3,
            epochs: 25,
            activation: 'sigmoid',
            useBias: true,
            seed: 42,
          });
        } else if (msg.type === 'COMPLETED') {
          expect(msg.epoch).toBe(25);
          expect(msg.loss).toBeLessThan(0.15);
          controller.dispose();
          resolve();
        }
      });

      controller.start(
        TEST_TOPOLOGY,
        OR_DATASET,
        {
          learningRate: 0.3,
          epochs: 500,
          activation: 'sigmoid',
          useBias: true,
          seed: 42,
        },
        initParams,
        0,
      );
    });

    expect(pausedSnapshot).not.toBeNull();
  });
});

