import React, { useEffect, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ActivationFunction,
  DatasetSample,
  NetworkParameters,
  NetworkTopology,
  WeightInitStrategy,
  getAllBiasNodeIds,
  getLinkKey,
  initializeNetworkParameters,
} from '../../core/nn-core';
import { getDictionary, Locale } from '../../i18n';
import {
  LossPoint,
  TrainingSessionController,
  TrainingStatus,
  clampEpochs,
  clampLearningRate,
} from './index';

export interface ParamsPanelProps {
  locale: Locale;
  topology: NetworkTopology;
  parameters: NetworkParameters;
  learningRate: number;
  epochs: number;
  activation: ActivationFunction;
  weightInit: WeightInitStrategy;
  useBias: boolean;
  dataset: DatasetSample[];
  targetLoss: number;
  allowManualWeights?: boolean;
  isReinforcementLevel?: boolean;
  onChangeLearningRate: (lr: number) => void;
  onChangeEpochs: (epochs: number) => void;
  onChangeActivation: (act: ActivationFunction) => void;
  onChangeWeightInit: (init: WeightInitStrategy) => void;
  onChangeUseBias: (useBias: boolean) => void;
  onChangeParameters: (params: NetworkParameters) => void;
  onTrainingMetricUpdate?: (epoch: number, loss: number, status: TrainingStatus) => void;
  onHintOpen?: (paramId: string) => void;
}

export function ParamsPanel({
  locale,
  topology,
  parameters,
  learningRate,
  epochs,
  activation,
  weightInit,
  useBias,
  dataset,
  targetLoss,
  allowManualWeights = true,
  isReinforcementLevel = false,
  onChangeLearningRate,
  onChangeEpochs,
  onChangeActivation,
  onChangeWeightInit,
  onChangeUseBias,
  onChangeParameters,
  onTrainingMetricUpdate,
  onHintOpen,
}: ParamsPanelProps): React.JSX.Element {
  const t = getDictionary(locale);
  const [status, setStatus] = useState<TrainingStatus>('idle');
  const [currentEpoch, setCurrentEpoch] = useState<number>(0);
  const [currentLoss, setCurrentLoss] = useState<number | null>(null);
  const [lossHistory, setLossHistory] = useState<LossPoint[]>([]);
  const [openHint, setOpenHint] = useState<string | null>(null);

  const controllerRef = useRef<TrainingSessionController | null>(null);
  const latestParamsRef = useRef<NetworkParameters>(parameters);
  latestParamsRef.current = parameters;

  useEffect(() => {
    const controller = new TrainingSessionController((msg) => {
      if (msg.type === 'EPOCH_UPDATE') {
        setCurrentEpoch(msg.epoch);
        setCurrentLoss(msg.loss);
        onChangeParameters(msg.parameters);
        setLossHistory((prev) => {
          const reward = Number(((1 - Math.min(1, msg.loss)) * 100).toFixed(1));
          const next = [...prev, { epoch: msg.epoch, loss: Number(msg.loss.toFixed(4)), reward }];
          return next.length > 500 ? next.slice(next.length - 500) : next;
        });
        onTrainingMetricUpdate?.(msg.epoch, msg.loss, 'running');
      } else if (msg.type === 'PAUSED') {
        setStatus('paused');
        setCurrentEpoch(msg.epoch);
        setCurrentLoss(msg.loss);
        onChangeParameters(msg.parameters);
        onTrainingMetricUpdate?.(msg.epoch, msg.loss, 'paused');
      } else if (msg.type === 'COMPLETED') {
        setStatus('completed');
        setCurrentEpoch(msg.epoch);
        setCurrentLoss(msg.loss);
        onChangeParameters(msg.parameters);
        onTrainingMetricUpdate?.(msg.epoch, msg.loss, 'completed');
      }
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleHint = (paramId: string) => {
    setOpenHint((prev) => {
      const next = prev === paramId ? null : paramId;
      if (next) {
        onHintOpen?.(paramId);
      }
      return next;
    });
  };

  const handleStartTraining = () => {
    setStatus('running');
    setCurrentEpoch(0);
    setLossHistory([]);
    controllerRef.current?.start(
      topology,
      dataset,
      {
        learningRate,
        epochs,
        activation,
        useBias,
        weightInit,
        seed: 42,
      },
      latestParamsRef.current,
      0,
    );
  };

  const handlePauseTraining = () => {
    controllerRef.current?.pause();
    setStatus('paused');
  };

  const handleResumeTraining = () => {
    setStatus('running');
    controllerRef.current?.resume({
      learningRate,
      epochs,
      activation,
      useBias,
      weightInit,
      seed: 42,
    });
  };

  const handleResetTraining = () => {
    controllerRef.current?.reset();
    setStatus('idle');
    setCurrentEpoch(0);
    setCurrentLoss(null);
    setLossHistory([]);
    const fresh = initializeNetworkParameters(topology, weightInit, 42);
    onChangeParameters(fresh);
  };

  const handleManualWeightChange = (linkKey: string, val: number) => {
    onChangeParameters({
      ...parameters,
      linkWeights: {
        ...parameters.linkWeights,
        [linkKey]: val,
      },
    });
  };

  const handleManualBiasChange = (nodeId: string, val: number) => {
    onChangeParameters({
      ...parameters,
      biases: {
        ...parameters.biases,
        [nodeId]: val,
      },
    });
  };

  const statusText =
    status === 'running'
      ? t.params.statusRunning
      : status === 'paused'
        ? t.params.statusPaused
        : status === 'completed'
          ? t.params.statusCompleted
          : t.params.statusIdle;

  return (
    <section className="params-card" aria-labelledby="params-heading">
      <div className="editor-header-row">
        <h2 id="params-heading">{t.params.title}</h2>
        <span className="status-pill" data-testid="training-status-pill">
          {statusText}
        </span>
      </div>

      <div className="params-grid">
        {/* Taxa de aprendizado */}
        <div className="param-field">
          <div className="param-label-row">
            <label htmlFor="lr-slider">
              {t.params.learningRateLabel}: <strong>{learningRate.toFixed(3)}</strong>
            </label>
            <button
              type="button"
              className="hint-btn"
              data-testid="hint-btn-lr"
              onClick={() => toggleHint('lr')}
            >
              ? {t.params.whatDoesItDo}
            </button>
          </div>
          <input
            id="lr-slider"
            type="range"
            min={0.001}
            max={1.0}
            step={0.005}
            value={learningRate}
            data-testid="lr-slider"
            onChange={(e) => onChangeLearningRate(clampLearningRate(Number(e.target.value)))}
          />
          {openHint === 'lr' && (
            <p className="param-hint" data-testid="hint-text-lr">
              {t.params.learningRateHint}
            </p>
          )}
        </div>

        {/* Épocas */}
        <div className="param-field">
          <div className="param-label-row">
            <label htmlFor="epochs-slider">
              {t.params.epochsLabel}: <strong>{epochs}</strong>
            </label>
            <button
              type="button"
              className="hint-btn"
              data-testid="hint-btn-epochs"
              onClick={() => toggleHint('epochs')}
            >
              ? {t.params.whatDoesItDo}
            </button>
          </div>
          <input
            id="epochs-slider"
            type="range"
            min={1}
            max={500}
            step={1}
            value={epochs}
            data-testid="epochs-slider"
            onChange={(e) => onChangeEpochs(clampEpochs(Number(e.target.value)))}
          />
          {openHint === 'epochs' && (
            <p className="param-hint" data-testid="hint-text-epochs">
              {t.params.epochsHint}
            </p>
          )}
        </div>

        {/* Função de Ativação */}
        <div className="param-field">
          <div className="param-label-row">
            <label htmlFor="activation-select">{t.params.activationLabel}</label>
            <button
              type="button"
              className="hint-btn"
              data-testid="hint-btn-activation"
              onClick={() => toggleHint('activation')}
            >
              ? {t.params.whatDoesItDo}
            </button>
          </div>
          <select
            id="activation-select"
            className="locale-select"
            value={activation}
            data-testid="activation-select"
            onChange={(e) => onChangeActivation(e.target.value as ActivationFunction)}
          >
            <option value="step">{t.params.activations.step}</option>
            <option value="sigmoid">{t.params.activations.sigmoid}</option>
            <option value="relu">{t.params.activations.relu}</option>
            <option value="tanh">{t.params.activations.tanh}</option>
          </select>
          {openHint === 'activation' && (
            <p className="param-hint" data-testid="hint-text-activation">
              {t.params.activationHint}
            </p>
          )}
        </div>

        {/* Inicialização de Pesos + Bias */}
        <div className="param-field">
          <div className="param-label-row">
            <label htmlFor="weight-init-select">{t.params.weightInitLabel}</label>
            <button
              type="button"
              className="hint-btn"
              data-testid="hint-btn-init"
              onClick={() => toggleHint('init')}
            >
              ? {t.params.whatDoesItDo}
            </button>
          </div>
          <select
            id="weight-init-select"
            className="locale-select"
            value={weightInit}
            data-testid="weight-init-select"
            onChange={(e) => {
              const nextInit = e.target.value as WeightInitStrategy;
              onChangeWeightInit(nextInit);
              onChangeParameters(initializeNetworkParameters(topology, nextInit, 42));
            }}
          >
            <option value="deterministic">{t.params.weightInits.deterministic}</option>
            <option value="xavier">{t.params.weightInits.xavier}</option>
            <option value="random">{t.params.weightInits.random}</option>
            <option value="zeros">{t.params.weightInits.zeros}</option>
          </select>
          {openHint === 'init' && (
            <p className="param-hint" data-testid="hint-text-init">
              {t.params.weightInitHint}
            </p>
          )}

          <div className="bias-toggle-row">
            <label htmlFor="bias-checkbox" className="bias-checkbox-label">
              <input
                id="bias-checkbox"
                type="checkbox"
                checked={useBias}
                data-testid="bias-checkbox"
                onChange={(e) => onChangeUseBias(e.target.checked)}
              />
              <span>{t.params.biasLabel}</span>
            </label>
            <button
              type="button"
              className="hint-btn"
              data-testid="hint-btn-bias"
              onClick={() => toggleHint('bias')}
            >
              ? {t.params.whatDoesItDo}
            </button>
          </div>
          {openHint === 'bias' && (
            <p className="param-hint" data-testid="hint-text-bias">
              {t.params.biasHint}
            </p>
          )}
        </div>
      </div>

      {/* Ajuste Manual de Pesos (Fases 1 e 2) */}
      {allowManualWeights && topology.links.length > 0 && (
        <div className="manual-weights-box" data-testid="manual-weights-box">
          <h3>{t.params.manualWeightsTitle}</h3>
          <div className="manual-sliders-grid">
            {topology.links.map(([from, to]) => {
              const key = getLinkKey(from, to);
              const val = parameters.linkWeights[key] ?? 0;
              return (
                <div key={key} className="manual-slider-item">
                  <label htmlFor={`manual-w-${key}`}>
                    w({from}→{to}): <strong>{val.toFixed(2)}</strong>
                  </label>
                  <input
                    id={`manual-w-${key}`}
                    type="range"
                    min={-3}
                    max={3}
                    step={0.05}
                    value={val}
                    data-testid={`manual-weight-${key}`}
                    onChange={(e) => handleManualWeightChange(key, Number(e.target.value))}
                  />
                </div>
              );
            })}
            {useBias &&
              getAllBiasNodeIds(topology).map((nodeId) => {
                const bVal = parameters.biases[nodeId] ?? 0;
                return (
                  <div key={nodeId} className="manual-slider-item">
                    <label htmlFor={`manual-b-${nodeId}`}>
                      bias({nodeId}): <strong>{bVal.toFixed(2)}</strong>
                    </label>
                    <input
                      id={`manual-b-${nodeId}`}
                      type="range"
                      min={-3}
                      max={3}
                      step={0.05}
                      value={bVal}
                      data-testid={`manual-bias-${nodeId}`}
                      onChange={(e) => handleManualBiasChange(nodeId, Number(e.target.value))}
                    />
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Barra de Controle de Treino + Métricas */}
      <div className="train-controls-row">
        <div className="train-buttons">
          {status !== 'running' && status !== 'paused' && (
            <button
              type="button"
              className="primary-btn"
              data-testid="train-start-btn"
              onClick={handleStartTraining}
            >
              ▶ {t.params.trainBtn}
            </button>
          )}
          {status === 'running' && (
            <button
              type="button"
              className="secondary-btn"
              data-testid="train-pause-btn"
              onClick={handlePauseTraining}
            >
              ⏸ {t.params.pauseBtn}
            </button>
          )}
          {status === 'paused' && (
            <button
              type="button"
              className="primary-btn"
              data-testid="train-resume-btn"
              onClick={handleResumeTraining}
            >
              ▶ {t.params.resumeBtn}
            </button>
          )}
          <button
            type="button"
            className="secondary-btn"
            data-testid="train-reset-btn"
            onClick={handleResetTraining}
          >
            ↺ {t.params.resetBtn}
          </button>
        </div>

        <div className="train-metrics">
          <span className="metric-badge" data-testid="epoch-counter">
            {t.params.epochCounter
              .replace('{current}', String(currentEpoch))
              .replace('{total}', String(epochs))}
          </span>
          <span className="metric-badge" data-testid="loss-counter">
            {t.params.currentLoss.replace(
              '{loss}',
              currentLoss !== null ? currentLoss.toFixed(4) : '—',
            )}
          </span>
          <span className="metric-badge target">
            {t.params.targetLoss.replace('{target}', targetLoss.toFixed(2))}
          </span>
        </div>
      </div>

      {/* Gráfico Recharts de Loss / Recompensa */}
      <div className="chart-box" data-testid="loss-chart-box">
        <h3>{isReinforcementLevel ? t.params.chartRewardTitle : t.params.chartTitle}</h3>
        <div className="recharts-wrapper-scroll">
          <LineChart
            width={720}
            height={220}
            data={
              lossHistory.length > 0
                ? lossHistory
                : [
                    { epoch: 0, loss: 0.35, reward: 65 },
                    { epoch: 1, loss: currentLoss ?? 0.25, reward: 75 },
                  ]
            }
            margin={{ top: 10, right: 24, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="epoch" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 'auto']} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #475569',
                borderRadius: '8px',
              }}
            />
            {!isReinforcementLevel && (
              <ReferenceLine
                y={targetLoss}
                stroke="#4ade80"
                strokeDasharray="5 5"
                label={{ value: `Meta ≤ ${targetLoss}`, fill: '#4ade80', fontSize: 11 }}
              />
            )}
            <Line
              type="monotone"
              dataKey={isReinforcementLevel ? 'reward' : 'loss'}
              stroke={isReinforcementLevel ? '#4ade80' : '#38bdf8'}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </div>
      </div>
    </section>
  );
}
