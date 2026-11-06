import React, { useMemo, useState } from 'react';
import {
  ActivationFunction,
  NetworkParameters,
  NetworkTopology,
  countHiddenNeurons,
  forwardPass,
  getLinkKey,
} from '../../core/nn-core';
import { getDictionary, Locale } from '../../i18n';
import {
  EditorLimits,
  addHiddenNeuron,
  autoConnectLayers,
  buildReactFlowElements,
  removeHiddenNeuron,
  toggleConnectionLink,
  toggleInputSensor,
  toggleOutputAction,
} from './index';

export interface NeuronEditorProps {
  locale: Locale;
  topology: NetworkTopology;
  parameters: NetworkParameters;
  activation: ActivationFunction;
  useBias: boolean;
  limits: EditorLimits;
  sensorPreviewValues?: Record<string, number>;
  onChangeTopology: (next: NetworkTopology) => void;
}

export function NeuronEditor({
  locale,
  topology,
  parameters,
  activation,
  useBias,
  limits,
  sensorPreviewValues = {
    dist_front: 0.8,
    floor_light: 1,
    dist_left: 0.4,
    dist_right: 0.6,
    target_angle: 0.25,
  },
  onChangeTopology,
}: NeuronEditorProps): React.JSX.Element {
  const t = getDictionary(locale);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [inspectedNeuronId, setInspectedNeuronId] = useState<string | null>(null);

  const liveForward = useMemo(() => {
    return forwardPass(topology, parameters, sensorPreviewValues, {
      useBias,
      outputActivation: activation,
    });
  }, [topology, parameters, sensorPreviewValues, useBias, activation]);

  const rfGraph = useMemo(
    () => buildReactFlowElements(topology, parameters, liveForward),
    [topology, parameters, liveForward],
  );

  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    rfGraph.nodes.forEach((n) => {
      map.set(n.id, n.position);
    });
    return map;
  }, [rfGraph.nodes]);

  const handleNodeActivate = (nodeId: string) => {
    if (!selectedSourceId) {
      setSelectedSourceId(nodeId);
      setInspectedNeuronId(nodeId);
      return;
    }
    if (selectedSourceId === nodeId) {
      setSelectedSourceId(null);
      return;
    }
    const next = toggleConnectionLink(topology, selectedSourceId, nodeId);
    onChangeTopology(next);
    setSelectedSourceId(null);
  };

  const handleNodeKeyDown = (e: React.KeyboardEvent, nodeId: string, isHidden: boolean) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNodeActivate(nodeId);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && isHidden) {
      e.preventDefault();
      if (selectedSourceId === nodeId) {
        setSelectedSourceId(null);
      }
      onChangeTopology(removeHiddenNeuron(topology, nodeId));
    }
  };

  const handleDragStartPalette = (
    e: React.DragEvent,
    payload: { kind: 'input' | 'hidden' | 'output'; id?: string; layerIndex?: number },
  ) => {
    e.dataTransfer.setData('application/neurobot-node', JSON.stringify(payload));
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/neurobot-node');
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as {
        kind: 'input' | 'hidden' | 'output';
        id?: string;
        layerIndex?: number;
      };
      if (payload.kind === 'input' && payload.id) {
        if (!topology.inputs.includes(payload.id)) {
          onChangeTopology(toggleInputSensor(topology, payload.id, limits));
        }
      } else if (payload.kind === 'output' && payload.id) {
        if (!topology.outputs.includes(payload.id)) {
          onChangeTopology(toggleOutputAction(topology, payload.id, limits));
        }
      } else if (payload.kind === 'hidden') {
        onChangeTopology(
          addHiddenNeuron(topology, payload.layerIndex ?? 0, activation, limits),
        );
      }
    } catch {
      // ignore invalid drag data
    }
  };

  const inspectedState = inspectedNeuronId ? liveForward.neurons[inspectedNeuronId] : null;
  const hiddenCount = countHiddenNeurons(topology);

  const getNeuronDisplayName = (id: string): string => {
    const sensorMap = t.editor.sensors as Record<string, string>;
    const actionMap = t.editor.actions as Record<string, string>;
    if (sensorMap[id]) return `${sensorMap[id]} (${id})`;
    if (actionMap[id]) return `${actionMap[id]} (${id})`;
    return id;
  };

  return (
    <section className="editor-card" aria-labelledby="editor-heading">
      <div className="editor-header-row">
        <div>
          <h2 id="editor-heading">{t.editor.title}</h2>
          <p className="editor-instructions">{t.editor.instructions}</p>
        </div>
        <span className="status-pill">
          {t.editor.limitsInfo
            .replace('{maxHidden}', String(limits.maxHiddenNeurons))
            .replace('{activation}', activation.toUpperCase())}
        </span>
      </div>

      {/* Paleta de Sensores, Camadas Ocultas e Ações (Drag & Drop + Clique + Teclado) */}
      <div className="editor-palettes">
        <div className="palette-group">
          <h3>{t.editor.inputsPalette}</h3>
          <div className="palette-buttons">
            {limits.allowedInputs.map((sensorId) => {
              const active = topology.inputs.includes(sensorId);
              const label = (t.editor.sensors as Record<string, string>)[sensorId] ?? sensorId;
              return (
                <button
                  key={sensorId}
                  type="button"
                  draggable
                  onDragStart={(e) =>
                    handleDragStartPalette(e, { kind: 'input', id: sensorId })
                  }
                  className={`palette-btn ${active ? 'active' : ''}`}
                  aria-pressed={active}
                  data-testid={`toggle-input-${sensorId}`}
                  onClick={() =>
                    onChangeTopology(toggleInputSensor(topology, sensorId, limits))
                  }
                >
                  {active ? '✓ ' : '+ '}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="palette-group">
          <h3>{t.editor.hiddenPalette}</h3>
          <div className="palette-buttons">
            <button
              type="button"
              draggable
              onDragStart={(e) =>
                handleDragStartPalette(e, { kind: 'hidden', layerIndex: 0 })
              }
              className="palette-btn"
              disabled={
                limits.maxHiddenLayers < 1 || hiddenCount >= limits.maxHiddenNeurons
              }
              data-testid="add-hidden-l1"
              onClick={() =>
                onChangeTopology(addHiddenNeuron(topology, 0, activation, limits))
              }
            >
              {t.editor.addHiddenL1}
            </button>
            {limits.maxHiddenLayers >= 2 && (
              <button
                type="button"
                draggable
                onDragStart={(e) =>
                  handleDragStartPalette(e, { kind: 'hidden', layerIndex: 1 })
                }
                className="palette-btn"
                disabled={hiddenCount >= limits.maxHiddenNeurons}
                data-testid="add-hidden-l2"
                onClick={() =>
                  onChangeTopology(addHiddenNeuron(topology, 1, activation, limits))
                }
              >
                {t.editor.addHiddenL2}
              </button>
            )}
          </div>
        </div>

        <div className="palette-group">
          <h3>{t.editor.outputsPalette}</h3>
          <div className="palette-buttons">
            {limits.allowedOutputs.map((actionId) => {
              const active = topology.outputs.includes(actionId);
              const label = (t.editor.actions as Record<string, string>)[actionId] ?? actionId;
              return (
                <button
                  key={actionId}
                  type="button"
                  draggable
                  onDragStart={(e) =>
                    handleDragStartPalette(e, { kind: 'output', id: actionId })
                  }
                  className={`palette-btn ${active ? 'active' : ''}`}
                  aria-pressed={active}
                  data-testid={`toggle-output-${actionId}`}
                  onClick={() =>
                    onChangeTopology(toggleOutputAction(topology, actionId, limits))
                  }
                >
                  {active ? '✓ ' : '+ '}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Barra de ações rápidas e legenda WCAG 2.1 AA (cor + padrão tracejado + símbolo +/-) */}
      <div className="editor-toolbar">
        <div className="toolbar-actions">
          <button
            type="button"
            className="secondary-btn"
            data-testid="auto-connect-btn"
            onClick={() => onChangeTopology(autoConnectLayers(topology))}
          >
            {t.editor.connectAll}
          </button>
          <button
            type="button"
            className="secondary-btn"
            data-testid="clear-links-btn"
            onClick={() => onChangeTopology({ ...topology, links: [] })}
          >
            {t.editor.clearLinks}
          </button>
        </div>

        <div className="weight-legend" aria-label="Legenda de pesos">
          <span className="legend-pos">━━ {t.editor.legendPositive}</span>
          <span className="legend-neg">┅┅ {t.editor.legendNegative}</span>
          <span className="legend-thick">{t.editor.legendThickness}</span>
        </div>
      </div>

      {selectedSourceId && (
        <div className="connection-banner" role="status">
          {t.editor.selectedSource.replace('{id}', selectedSourceId)}
        </div>
      )}

      {/* Canvas Interativo de Neurônios e Cabos */}
      <div
        className="neuron-canvas-wrapper"
        data-testid="neuron-canvas"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleCanvasDrop}
      >
        <svg
          className="neuron-svg-canvas"
          viewBox="0 0 800 340"
          role="group"
          aria-label={t.editor.title}
        >
          {/* Cabos (links) com espessura = magnitude e cor + tracejado + sinal (+/-) */}
          {topology.links.map(([from, to]) => {
            const p1 = nodePositions.get(from);
            const p2 = nodePositions.get(to);
            if (!p1 || !p2) return null;

            const key = getLinkKey(from, to);
            const weight = parameters.linkWeights[key] ?? 0.65;
            const isPositive = weight >= 0;
            const strokeColor = isPositive ? '#38bdf8' : '#fb923c';
            const strokeWidth = 2 + Math.min(6, Math.abs(weight) * 2.4);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const signSymbol = isPositive ? '+' : '−';

            return (
              <g
                key={key}
                data-testid={`cable-${from}-${to}`}
                onClick={() => onChangeTopology(toggleConnectionLink(topology, from, to))}
                style={{ cursor: 'pointer' }}
              >
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isPositive ? undefined : '7 5'}
                />
                <rect
                  x={midX - 24}
                  y={midY - 11}
                  width={48}
                  height={22}
                  rx={6}
                  fill="#0f172a"
                  stroke={strokeColor}
                  strokeWidth={1.5}
                />
                <text
                  x={midX}
                  y={midY + 4}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="11"
                  fontWeight="700"
                >
                  {`${signSymbol}${Math.abs(weight).toFixed(2)}`}
                </text>
              </g>
            );
          })}

          {/* Nós (Neurônios) */}
          {rfGraph.nodes.map((node) => {
            const kind = node.data.kind as 'input' | 'hidden' | 'output';
            const isSelected = selectedSourceId === node.id;
            const isInspected = inspectedNeuronId === node.id;
            const state = liveForward.neurons[node.id];

            const fillByKind =
              kind === 'input' ? '#0284c7' : kind === 'hidden' ? '#4f46e5' : '#059669';

            return (
              <g
                key={node.id}
                transform={`translate(${node.position.x}, ${node.position.y})`}
                role="button"
                tabIndex={0}
                aria-label={`Neurônio ${node.id}`}
                data-testid={`neuron-node-${node.id}`}
                onClick={() => handleNodeActivate(node.id)}
                onKeyDown={(e) => handleNodeKeyDown(e, node.id, kind === 'hidden')}
                onMouseEnter={() => setInspectedNeuronId(node.id)}
                onFocus={() => setInspectedNeuronId(node.id)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  r={28}
                  fill={fillByKind}
                  stroke={isSelected ? '#fb923c' : isInspected ? '#38bdf8' : '#f8fafc'}
                  strokeWidth={isSelected || isInspected ? 4 : 2}
                />
                <text
                  y={-3}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="12"
                  fontWeight="800"
                >
                  {node.id}
                </text>
                <text
                  y={13}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="10"
                  fontWeight="600"
                >
                  {`a=${(state?.output ?? 0).toFixed(2)}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Painel de Inspeção em Tempo Real (RF-06) + JSON Exportado */}
      <div className="editor-bottom-grid">
        <div className="inspector-box" data-testid="neuron-inspector">
          <h3>{t.editor.inspectorTitle}</h3>
          {inspectedState ? (
            <div className="inspector-metrics">
              <div>
                <strong>ID:</strong> {getNeuronDisplayName(inspectedState.id)}
              </div>
              <div data-testid="inspector-weighted-sum">
                <strong>{t.editor.weightedSum}:</strong> {inspectedState.weightedSum.toFixed(4)}
              </div>
              <div data-testid="inspector-activated-output">
                <strong>{t.editor.activatedOutput}:</strong> {inspectedState.output.toFixed(4)}
              </div>
              <div>
                <strong>{t.editor.activationFn}:</strong> {inspectedState.activation}
              </div>
            </div>
          ) : (
            <p className="inspector-empty">{t.editor.inspectorEmpty}</p>
          )}
        </div>

        <div className="topology-json-box">
          <h3>{t.editor.topologyJsonTitle}</h3>
          <pre data-testid="exported-topology-json" className="topology-pre">
            {JSON.stringify(topology, null, 2)}
          </pre>
        </div>
      </div>
    </section>
  );
}
