import {
  DatasetSample,
  NetworkParameters,
  NetworkTopology,
  TrainingHyperparams,
} from '../../core/nn-core';
import type { WorkerInboundMessage, WorkerOutboundMessage } from '../../workers/train.worker';

export const PARAMS_FEATURE_ID = 'params';

export type TrainingStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface LossPoint {
  epoch: number;
  loss: number;
  reward?: number;
}

export function clampLearningRate(lr: number): number {
  if (Number.isNaN(lr)) return 0.1;
  return Math.max(0.001, Math.min(1.0, Number(lr.toFixed(4))));
}

export function clampEpochs(epochs: number): number {
  if (Number.isNaN(epochs)) return 100;
  return Math.max(1, Math.min(500, Math.round(epochs)));
}

/**
 * Gerenciador de sessão de treino que usa Web Worker no navegador
 * e fallback assíncrono não-bloqueante em ambientes de teste (jsdom) sem Worker nativo.
 */
export class TrainingSessionController {
  private worker: Worker | null = null;
  private onMessageCallback: (msg: WorkerOutboundMessage) => void;

  // Estado para fallback quando Worker nativo não está disponível (ex: Vitest jsdom)
  private fallbackPaused = false;
  private fallbackRunId = 0;
  private fallbackTopology: NetworkTopology | null = null;
  private fallbackDataset: DatasetSample[] = [];
  private fallbackHyperparams: TrainingHyperparams | null = null;
  private fallbackParams: NetworkParameters | null = null;
  private fallbackEpoch = 0;
  private fallbackLoss = 1;
  private fallbackMomentum: {
    vWeights: Record<string, number>;
    vBiases: Record<string, number>;
  } = { vWeights: {}, vBiases: {} };

  constructor(onMessage: (msg: WorkerOutboundMessage) => void) {
    this.onMessageCallback = onMessage;
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('../../workers/train.worker.ts', import.meta.url), {
          type: 'module',
        });
        this.worker.onmessage = (e: MessageEvent<WorkerOutboundMessage>) => {
          this.onMessageCallback(e.data);
        };
      } catch {
        this.worker = null;
      }
    }
  }

  public start(
    topology: NetworkTopology,
    dataset: DatasetSample[],
    hyperparams: TrainingHyperparams,
    initialParams: NetworkParameters,
    startEpoch = 0,
  ): void {
    const msg: WorkerInboundMessage = {
      type: 'START',
      topology,
      dataset,
      hyperparams,
      initialParams,
      startEpoch,
    };

    if (this.worker) {
      this.worker.postMessage(msg);
      return;
    }

    this.fallbackRunId += 1;
    this.fallbackPaused = false;
    this.fallbackTopology = topology;
    this.fallbackDataset = dataset;
    this.fallbackHyperparams = hyperparams;
    this.fallbackParams = {
      linkWeights: { ...initialParams.linkWeights },
      biases: { ...initialParams.biases },
    };
    this.fallbackEpoch = startEpoch;
    this.fallbackMomentum = { vWeights: {}, vBiases: {} };
    void this.runFallbackLoop(this.fallbackRunId);
  }

  public pause(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'PAUSE' } satisfies WorkerInboundMessage);
      return;
    }
    this.fallbackPaused = true;
  }

  public resume(hyperparams?: TrainingHyperparams): void {
    if (this.worker) {
      this.worker.postMessage({
        type: 'RESUME',
        hyperparams,
      } satisfies WorkerInboundMessage);
      return;
    }
    if (!this.fallbackTopology || !this.fallbackHyperparams || !this.fallbackParams) return;
    if (hyperparams) {
      this.fallbackHyperparams = hyperparams;
    }
    this.fallbackPaused = false;
    this.fallbackRunId += 1;
    void this.runFallbackLoop(this.fallbackRunId);
  }

  public reset(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'RESET' } satisfies WorkerInboundMessage);
      return;
    }
    this.fallbackPaused = true;
    this.fallbackRunId += 1;
    this.fallbackEpoch = 0;
    this.fallbackLoss = 1;
    this.fallbackMomentum = { vWeights: {}, vBiases: {} };
  }

  public dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.fallbackPaused = true;
    this.fallbackRunId += 1;
  }

  private async runFallbackLoop(activeRunId: number): Promise<void> {
    if (!this.fallbackTopology || !this.fallbackHyperparams || !this.fallbackParams) return;
    const { runBackpropEpoch } = await import('../../core/nn-core/tfAdapter');

    while (this.fallbackEpoch < this.fallbackHyperparams.epochs) {
      if (this.fallbackPaused || activeRunId !== this.fallbackRunId) {
        this.onMessageCallback({
          type: 'PAUSED',
          epoch: this.fallbackEpoch,
          loss: this.fallbackLoss,
          parameters: this.fallbackParams,
        });
        return;
      }

      this.fallbackEpoch += 1;
      const { nextParams, loss } = runBackpropEpoch(
        this.fallbackTopology,
        this.fallbackParams,
        this.fallbackDataset,
        this.fallbackHyperparams,
        this.fallbackMomentum,
      );
      this.fallbackParams = nextParams;
      this.fallbackLoss = loss;

      this.onMessageCallback({
        type: 'EPOCH_UPDATE',
        epoch: this.fallbackEpoch,
        loss: this.fallbackLoss,
        parameters: this.fallbackParams,
      });

      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    if (!this.fallbackPaused && activeRunId === this.fallbackRunId && this.fallbackParams) {
      this.onMessageCallback({
        type: 'COMPLETED',
        epoch: this.fallbackEpoch,
        loss: this.fallbackLoss,
        parameters: this.fallbackParams,
      });
    }
  }
}
