import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivationFunction,
  NetworkParameters,
  NetworkTopology,
} from '../../core/nn-core';
import {
  ArenaMapConfig,
  DEFAULT_ARENA_MAP,
  SimulationEpisodeResult,
  SimulationFrame,
  runSimulationEpisode,
} from '../../core/simulation';
import { getDictionary, Locale } from '../../i18n';
import { PlaybackSpeed } from './index';

export interface ArenaViewProps {
  locale: Locale;
  seed?: number;
  topology: NetworkTopology;
  parameters: NetworkParameters;
  activation: ActivationFunction;
  useBias: boolean;
  arenaMap?: ArenaMapConfig;
  onEpisodeComplete?: (result: SimulationEpisodeResult) => void;
}

export function ArenaView({
  locale,
  seed = 42,
  topology,
  parameters,
  activation,
  useBias,
  arenaMap = DEFAULT_ARENA_MAP,
  onEpisodeComplete,
}: ArenaViewProps): React.JSX.Element {
  const t = getDictionary(locale);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [lastEpisode, setLastEpisode] = useState<SimulationEpisodeResult | null>(null);
  const [frameIndex, setFrameIndex] = useState<number>(0);
  const [playbackMode, setPlaybackMode] = useState<'idle' | 'running' | 'replay' | 'finished'>(
    'idle',
  );
  const pixiHostRef = useRef<HTMLDivElement | null>(null);

  // Calcula um episódio inicial para pré-visualização da posição inicial e sensores
  const previewEpisode = useMemo(() => {
    return runSimulationEpisode({
      seed,
      tickRateHz: 30,
      topology,
      parameters,
      activation,
      useBias,
      arena: arenaMap,
    });
  }, [seed, topology, parameters, activation, useBias, arenaMap]);

  const activeEpisode = lastEpisode ?? previewEpisode;
  const currentFrame: SimulationFrame | undefined =
    activeEpisode.frames[Math.min(frameIndex, Math.max(0, activeEpisode.frames.length - 1))];

  // Inicializa o motor Pixi.js sob demanda (mantendo compatibilidade em WebGL/Canvas e testes headless)
  useEffect(() => {
    let disposed = false;
    let cleanupFn: (() => void) | null = null;

    async function mountPixiLayer() {
      if (!pixiHostRef.current || typeof window === 'undefined') return;
      try {
        const PIXI = await import('pixi.js');
        if (disposed || !pixiHostRef.current || !PIXI.Application) return;
        const app = new PIXI.Application();
        if (typeof app.init === 'function') {
          await app.init({
            width: arenaMap.width,
            height: arenaMap.height,
            backgroundAlpha: 0,
            antialias: true,
          });
          if (!disposed && pixiHostRef.current && app.canvas) {
            app.canvas.style.position = 'absolute';
            app.canvas.style.inset = '0';
            app.canvas.style.pointerEvents = 'none';
            app.canvas.style.opacity = '0.15';
            pixiHostRef.current.appendChild(app.canvas);
            cleanupFn = () => {
              app.destroy(true);
            };
          }
        }
      } catch {
        // Fallback silencioso para renderizador 2D determinístico quando WebGL está desativado
      }
    }

    void mountPixiLayer();
    return () => {
      disposed = true;
      cleanupFn?.();
    };
  }, [arenaMap.width, arenaMap.height]);

  // Loop de reprodução a 30 ticks/s escalado por 0.5x, 1x ou 4x (RF-07)
  useEffect(() => {
    if (playbackMode !== 'running' && playbackMode !== 'replay') return;
    if (!lastEpisode) return;

    const intervalMs = Math.max(8, Math.round(1000 / (30 * speed)));
    const timer = setInterval(() => {
      setFrameIndex((prev) => {
        if (prev + 1 >= lastEpisode.frames.length) {
          clearInterval(timer);
          setPlaybackMode('finished');
          if (playbackMode === 'running') {
            onEpisodeComplete?.(lastEpisode);
          }
          return lastEpisode.frames.length - 1;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [playbackMode, speed, lastEpisode, onEpisodeComplete]);

  const handleRunArena = () => {
    const episode = runSimulationEpisode({
      seed,
      tickRateHz: 30,
      topology,
      parameters,
      activation,
      useBias,
      arena: arenaMap,
    });
    setLastEpisode(episode);
    setFrameIndex(0);
    setPlaybackMode('running');
  };

  const handleReplay = () => {
    if (!lastEpisode) {
      handleRunArena();
      return;
    }
    setFrameIndex(0);
    setPlaybackMode('replay');
  };

  const robotX = currentFrame?.x ?? arenaMap.startX;
  const robotY = currentFrame?.y ?? arenaMap.startY;
  const robotJumpOffset = currentFrame?.isJumping ? -28 : 0;
  const robotAngle = currentFrame?.angleDeg ?? 0;

  const outcomeText =
    playbackMode === 'running'
      ? t.arena.outcomeRunning
      : playbackMode === 'replay'
        ? t.arena.outcomeReplay
        : playbackMode === 'finished' && lastEpisode
          ? lastEpisode.outcome === 'success'
            ? t.arena.outcomeSuccess
            : lastEpisode.outcome === 'collision'
              ? t.arena.outcomeCollision
              : t.arena.outcomeTimeout
          : t.arena.outcomeReady;

  return (
    <section className="arena-card" aria-labelledby="arena-heading">
      <div className="editor-header-row">
        <div>
          <h2 id="arena-heading">{t.arena.title}</h2>
          <p className="editor-instructions" data-testid="arena-outcome-banner">
            {outcomeText}
          </p>
        </div>
        <span className="status-pill" data-testid="arena-seed-badge">
          {t.arena.seedBadge.replace('{seed}', String(seed))}
        </span>
      </div>

      {/* Controles de Execução, Velocidade (0.5x, 1x, 4x) e Replay (RF-07) */}
      <div className="arena-controls-row">
        <div className="train-buttons">
          <button
            type="button"
            className="primary-btn"
            data-testid="run-arena-btn"
            onClick={handleRunArena}
          >
            🤖 {t.arena.runBtn}
          </button>
          <button
            type="button"
            className="secondary-btn"
            data-testid="replay-arena-btn"
            disabled={!lastEpisode}
            onClick={handleReplay}
          >
            ↺ {t.arena.replayBtn}
          </button>
        </div>

        <div className="speed-controls" role="group" aria-label={t.arena.speedLabel}>
          <span>{t.arena.speedLabel}</span>
          {([0.5, 1, 4] as PlaybackSpeed[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`palette-btn ${speed === s ? 'active' : ''}`}
              data-testid={`speed-btn-${s}x`}
              onClick={() => setSpeed(s)}
            >
              {String(s).replace('.', ',')}×
            </button>
          ))}
        </div>

        <div className="train-metrics">
          <span className="metric-badge" data-testid="arena-tick-counter">
            {t.arena.tickLabel
              .replace('{current}', String(currentFrame?.tick ?? 0))
              .replace('{total}', String(activeEpisode.frames.length))}
          </span>
          <span className="metric-badge target" data-testid="arena-reward-counter">
            {t.arena.rewardLabel.replace(
              '{reward}',
              String(currentFrame?.cumulativeReward ?? 0),
            )}
          </span>
        </div>
      </div>

      {/* Viewport 2D da Arena (Pixi.js + Camada Vetorial de Alta Nitidez) */}
      <div
        ref={pixiHostRef}
        className="arena-viewport"
        data-testid="arena-viewport"
        style={{ position: 'relative' }}
      >
        <svg
          viewBox={`0 0 ${arenaMap.width} ${arenaMap.height}`}
          className="arena-svg"
          role="img"
          aria-label={t.arena.title}
        >
          {/* Grade de fundo e piso */}
          <rect
            x={0}
            y={0}
            width={arenaMap.width}
            height={arenaMap.height}
            fill="#090f1d"
          />
          <line
            x1={0}
            y1={195}
            x2={arenaMap.width}
            y2={195}
            stroke="#334155"
            strokeWidth={3}
          />

          {/* Trilha dos frames percorridos no episódio */}
          {activeEpisode.frames.slice(0, frameIndex + 1).map((f) => (
            <circle
              key={f.tick}
              cx={f.x}
              cy={f.y + (f.isJumping ? -28 : 0)}
              r={2}
              fill="#38bdf8"
              opacity={0.45}
            />
          ))}

          {/* Porta lógica nas fases 2 e 4 */}
          {(arenaMap.mode === 'logic_gate_and_or' || arenaMap.mode === 'xor_gate') && (
            <g transform="translate(440, 120)">
              <rect
                x={-8}
                y={0}
                width={16}
                height={75}
                rx={4}
                fill={currentFrame?.doorOpen ? '#22c55e' : '#ef4444'}
                opacity={currentFrame?.doorOpen ? 0.35 : 0.9}
              />
              <text
                x={0}
                y={-8}
                textAnchor="middle"
                fill={currentFrame?.doorOpen ? '#4ade80' : '#f87171'}
                fontSize="11"
                fontWeight="700"
              >
                {currentFrame?.doorOpen ? 'PORTA ABERTA' : 'PORTA FECHADA'}
              </text>
            </g>
          )}

          {/* Obstáculos / Caixas */}
          {arenaMap.obstacles.map((obs) => (
            <g key={obs.id} transform={`translate(${obs.x - obs.width / 2}, ${obs.y})`}>
              <rect
                width={obs.width}
                height={obs.height}
                rx={4}
                fill="#fb923c"
                stroke="#fed7aa"
                strokeWidth={1.5}
              />
            </g>
          ))}

          {/* Alvo / Bandeira de Chegada */}
          <g transform={`translate(${arenaMap.targetX}, ${arenaMap.targetY - 35})`}>
            <line x1={0} y1={0} x2={0} y2={35} stroke="#4ade80" strokeWidth={3} />
            <polygon points="0,0 24,8 0,16" fill="#4ade80" />
            <circle cx={0} cy={35} r={6} fill="#22c55e" />
          </g>

          {/* Robô NeuroBot + Feixe de Sensor Frontal */}
          <g
            transform={`translate(${robotX}, ${robotY + robotJumpOffset}) rotate(${robotAngle})`}
            data-testid="arena-robot-entity"
          >
            {/* Feixe do sensor frontal */}
            <line
              x1={14}
              y1={-6}
              x2={64}
              y2={-6}
              stroke="#38bdf8"
              strokeWidth={2}
              strokeDasharray="4 3"
              opacity={0.75}
            />
            {/* Corpo do robô */}
            <rect
              x={-16}
              y={-22}
              width={32}
              height={22}
              rx={6}
              fill="#38bdf8"
              stroke="#f8fafc"
              strokeWidth={2}
            />
            {/* Visor do robô */}
            <circle cx={7} cy={-12} r={4} fill="#0f172a" />
            <circle cx={8} cy={-13} r={1.5} fill="#4ade80" />
            {/* Rodas */}
            <circle cx={-9} cy={2} r={5} fill="#64748b" />
            <circle cx={9} cy={2} r={5} fill="#64748b" />
          </g>
        </svg>
      </div>

      {/* Telemetria de Sensores e Ações do Tick Atual */}
      <div className="editor-bottom-grid">
        <div className="inspector-box">
          <h3>{t.arena.sensorsTelemetry}</h3>
          <div className="telemetry-pills">
            {Object.entries(currentFrame?.sensors ?? {}).map(([k, v]) => (
              <span key={k} className="uid-pill">
                {k}: <strong>{v.toFixed(2)}</strong>
              </span>
            ))}
          </div>
        </div>
        <div className="inspector-box">
          <h3>{t.arena.actionsTelemetry}</h3>
          <div className="telemetry-pills">
            {Object.entries(currentFrame?.actions ?? {}).map(([k, v]) => (
              <span key={k} className="uid-pill">
                {k}: <strong>{v.toFixed(2)}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
