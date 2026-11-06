import type {
  DatasetSample,
  NetworkParameters,
  NetworkTopology,
  TrainingHyperparams,
} from '../core/nn-core';

export type WorkerInboundMessage =
  | {
      type: 'START';
      topology: NetworkTopology;
      dataset: DatasetSample[];
      hyperparams: TrainingHyperparams;
      initialParams: NetworkParameters;
      startEpoch?: number;
    }
  | { type: 'PAUSE' }
  | {
      type: 'RESUME';
      totalEpochs?: number;
      hyperparams?: TrainingHyperparams;
    }
  | { type: 'RESET' };

export type WorkerOutboundMessage =
  | {
      type: 'EPOCH_UPDATE';
      epoch: number;
      loss: number;
      parameters: NetworkParameters;
    }
  | {
      type: 'PAUSED';
      epoch: number;
      loss: number;
      parameters: NetworkParameters;
    }
  | {
      type: 'COMPLETED';
      epoch: number;
      loss: number;
      parameters: NetworkParameters;
    };

let isPaused = false;
let runId = 0;
let savedTopology: NetworkTopology | null = null;
let savedDataset: DatasetSample[] = [];
let savedHyperparams: TrainingHyperparams | null = null;
let savedParams: NetworkParameters | null = null;
let savedEpoch = 0;
let savedLoss = 1;
let savedMomentum: {
  vWeights: Record<string, number>;
  vBiases: Record<string, number>;
} = { vWeights: {}, vBiases: {} };

async function executeLoop(activeRunId: number): Promise<void> {
  if (!savedTopology || !savedHyperparams || !savedParams) return;

  // Carrega TensorFlow.js sob demanda dentro do Web Worker (RNF-02)
  const { runBackpropEpoch } = await import('../core/nn-core/tfAdapter');

  while (savedEpoch < savedHyperparams.epochs) {
    if (isPaused || activeRunId !== runId) {
      self.postMessage({
        type: 'PAUSED',
        epoch: savedEpoch,
        loss: savedLoss,
        parameters: savedParams,
      } satisfies WorkerOutboundMessage);
      return;
    }

    savedEpoch += 1;
    const { nextParams, loss } = runBackpropEpoch(
      savedTopology,
      savedParams,
      savedDataset,
      savedHyperparams,
      savedMomentum,
    );
    savedParams = nextParams;
    savedLoss = loss;

    self.postMessage({
      type: 'EPOCH_UPDATE',
      epoch: savedEpoch,
      loss: savedLoss,
      parameters: savedParams,
    } satisfies WorkerOutboundMessage);

    // Cede controle ao loop de mensagens do Worker a cada época para responder a PAUSE instantaneamente
    await new Promise((resolve) => setTimeout(resolve, 2));
  }

  if (!isPaused && activeRunId === runId && savedParams) {
    self.postMessage({
      type: 'COMPLETED',
      epoch: savedEpoch,
      loss: savedLoss,
      parameters: savedParams,
    } satisfies WorkerOutboundMessage);
  }
}

self.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data;

  if (msg.type === 'START') {
    runId += 1;
    isPaused = false;
    savedTopology = msg.topology;
    savedDataset = msg.dataset;
    savedHyperparams = msg.hyperparams;
    savedParams = msg.initialParams;
    savedEpoch = msg.startEpoch ?? 0;
    savedMomentum = { vWeights: {}, vBiases: {} };
    void executeLoop(runId);
  } else if (msg.type === 'PAUSE') {
    isPaused = true;
  } else if (msg.type === 'RESUME') {
    if (!savedTopology || !savedHyperparams || !savedParams) return;
    if (msg.hyperparams) {
      savedHyperparams = msg.hyperparams;
    }
    if (msg.totalEpochs !== undefined) {
      savedHyperparams = { ...savedHyperparams, epochs: msg.totalEpochs };
    }
    isPaused = false;
    runId += 1;
    void executeLoop(runId);
  } else if (msg.type === 'RESET') {
    isPaused = true;
    runId += 1;
    savedEpoch = 0;
    savedLoss = 1;
    savedMomentum = { vWeights: {}, vBiases: {} };
  }
};
