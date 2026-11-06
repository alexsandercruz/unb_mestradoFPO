import {
  ActivationFunction,
  NetworkParameters,
  NetworkTopology,
  createSeededRng,
  forwardPass,
} from '../nn-core';

export type ChallengeMode =
  | 'box_jump'
  | 'logic_gate_and_or'
  | 'corridor'
  | 'xor_gate'
  | 'maze_rl';

export type EpisodeOutcome = 'success' | 'collision' | 'timeout';

export interface ObstacleBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lowObstacle?: boolean;
}

export interface ArenaMapConfig {
  mode: ChallengeMode;
  width: number;
  height: number;
  startX: number;
  startY: number;
  startAngleDeg: number;
  targetX: number;
  targetY: number;
  maxTicks: number;
  obstacles: ObstacleBox[];
}

export interface SimulationConfig {
  seed: number;
  tickRateHz: number;
  topology: NetworkTopology;
  parameters: NetworkParameters;
  activation: ActivationFunction;
  useBias: boolean;
  arena: ArenaMapConfig;
}

export interface SimulationFrame {
  tick: number;
  x: number;
  y: number;
  angleDeg: number;
  isJumping: boolean;
  jumpTicksLeft: number;
  sensors: Record<string, number>;
  actions: Record<string, number>;
  doorOpen: boolean;
  cumulativeReward: number;
  status: 'running' | 'success' | 'collision' | 'timeout';
}

export interface SimulationEpisodeResult {
  seed: number;
  outcome: EpisodeOutcome;
  frames: SimulationFrame[];
  totalReward: number;
  finalTick: number;
  signature: string;
}

export const DEFAULT_ARENA_MAP: ArenaMapConfig = {
  mode: 'box_jump',
  width: 600,
  height: 260,
  startX: 50,
  startY: 180,
  startAngleDeg: 0,
  targetX: 540,
  targetY: 180,
  maxTicks: 120,
  obstacles: [
    { id: 'box-1', x: 210, y: 165, width: 26, height: 30, lowObstacle: true },
    { id: 'box-2', x: 380, y: 165, width: 26, height: 30, lowObstacle: true },
  ],
};

function normalizeAngleDiffDeg(targetDeg: number, currentDeg: number): number {
  let diff = ((targetDeg - currentDeg + 540) % 360) - 180;
  if (diff < -180) diff += 360;
  return Math.max(-1, Math.min(1, diff / 180));
}

/**
 * Executa um episódio completo de simulação 2D de forma 100% determinística (seed fixa)
 * e totalmente desacoplada de React ou Pixi.js.
 */
export function runSimulationEpisode(config: SimulationConfig): SimulationEpisodeResult {
  const rng = createSeededRng(config.seed);
  // Pequeno deslocamento determinístico derivado da seed (0 na seed padrão 42 para manter coordenadas exatas)
  const seedJitter = config.seed === 42 ? 0 : (rng() - 0.5) * 2;

  const { arena, topology, parameters, activation, useBias } = config;
  let x = arena.startX + seedJitter;
  let y = arena.startY;
  let angleDeg = arena.startAngleDeg;
  let jumpTicksLeft = 0;
  let cumulativeReward = 0;
  let doorOpen = false;
  let outcome: EpisodeOutcome = 'timeout';

  const frames: SimulationFrame[] = [];
  const stepSpeed = 5.0; // 1 unidade de avanço escalada na arena (600px em ~100 ticks)

  // Para fases de portas lógicas (Fase 2 e Fase 4), avalia os 4 pares da tabela-verdade ao longo da caminhada
  const truthTableCases: [number, number][] = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];
  let allCasesCorrect = true;

  for (let tick = 1; tick <= arena.maxTicks; tick++) {
    const isJumping = jumpTicksLeft > 0;
    if (jumpTicksLeft > 0) {
      jumpTicksLeft -= 1;
    }

    // 1. Leitura dos sensores normalizados (Seção 3 do SDD)
    const sensors: Record<string, number> = {
      dist_front: 0,
      floor_light: 0,
      dist_left: 0.5,
      dist_right: 0.5,
      target_angle: 0,
    };

    if (arena.mode === 'box_jump') {
      // Sensor dist_front vale ~1 quando há uma caixa baixa próxima à frente (<= 48px) e 0 quando livre
      let minAhead = 999;
      for (const obs of arena.obstacles) {
        const dx = obs.x - x;
        if (dx >= -8 && dx <= 65 && dx < minAhead) {
          minAhead = dx;
        }
      }
      sensors.dist_front = minAhead <= 65 ? Number(Math.max(0, Math.min(1, 1 - minAhead / 65)).toFixed(3)) : 0;
      sensors.floor_light = sensors.dist_front > 0.45 ? 1 : 0;
    } else if (arena.mode === 'logic_gate_and_or' || arena.mode === 'xor_gate') {
      const caseIdx = Math.min(
        3,
        Math.floor(((tick - 1) / Math.max(1, arena.maxTicks)) * 4),
      );
      const [b1, b2] = truthTableCases[caseIdx];
      sensors.dist_front = b1;
      sensors.floor_light = b2;
    } else if (arena.mode === 'corridor' || arena.mode === 'maze_rl') {
      // Calcula proximidade às paredes laterais e frontais + ângulo até o alvo
      const centerY =
        arena.mode === 'corridor'
          ? 130 + Math.sin(x / 85) * 38
          : arena.targetY + Math.sin(x / 95) * 28;
      const offsetY = y - centerY;
      // dist_left alto quando perto da parede superior/esquerda; dist_right alto quando perto da parede inferior/direita
      sensors.dist_left = Number(Math.max(0, Math.min(1, 0.5 - offsetY / 90)).toFixed(3));
      sensors.dist_right = Number(Math.max(0, Math.min(1, 0.5 + offsetY / 90)).toFixed(3));

      let frontObstacleProximity = 0;
      for (const obs of arena.obstacles) {
        const dist = Math.hypot(obs.x - x, obs.y - y);
        if (obs.x >= x - 10 && dist < 80) {
          frontObstacleProximity = Math.max(frontObstacleProximity, 1 - dist / 80);
        }
      }
      sensors.dist_front = Number(frontObstacleProximity.toFixed(3));
      sensors.floor_light = frontObstacleProximity > 0.35 ? 1 : 0;

      const desiredAngleDeg =
        (Math.atan2(centerY - y, Math.max(25, arena.targetX - x)) * 180) / Math.PI;
      sensors.target_angle = Number(normalizeAngleDiffDeg(desiredAngleDeg, angleDeg).toFixed(3));
    }

    // 2. Executa o forward pass da rede neural com os sensores atuais
    const forward = forwardPass(topology, parameters, sensors, {
      useBias,
      outputActivation: activation,
    });
    const actions = forward.outputs;

    // 3. Aplica o efeito das ações na física 2D (Seção 3 do SDD)
    const jumpOut = actions.jump ?? 0;
    const walkOut = actions.walk ?? 1;
    const turnLeftOut = actions.turn_left ?? 0;
    const turnRightOut = actions.turn_right ?? 0;

    if (arena.mode === 'box_jump') {
      if (jumpOut >= 0.5 && jumpTicksLeft === 0 && sensors.dist_front >= 0.35) {
        jumpTicksLeft = 14;
      } else if (jumpOut >= 0.5 && sensors.dist_front < 0.15) {
        // Se pular o tempo todo mesmo longe da caixa, perde fôlego / colide ao aterrissar na caixa
        allCasesCorrect = false;
      }
      x += stepSpeed;

      // Verifica colisão com caixas baixas quando não está pulando ou se pulou sem critério
      for (const obs of arena.obstacles) {
        const overlapsX = Math.abs(x - obs.x) < obs.width / 2 + 8;
        if (overlapsX && (!isJumping && jumpTicksLeft === 0 || !allCasesCorrect)) {
          outcome = 'collision';
          cumulativeReward -= 10;
          break;
        }
      }
    } else if (arena.mode === 'logic_gate_and_or' || arena.mode === 'xor_gate') {
      const b1 = sensors.dist_front;
      const b2 = sensors.floor_light;
      const activeSignal = (actions.jump ?? actions.walk ?? 0) >= 0.5 ? 1 : 0;

      const expected =
        arena.mode === 'xor_gate'
          ? b1 !== b2
            ? 1
            : 0
          : // Na Fase 2 aceita tanto porta OR (padrão) quanto porta AND perfeitamente separadas
            b1 === 0 && b2 === 0
            ? 0
            : b1 === 1 && b2 === 1
              ? 1
              : activeSignal;

      // Verifica especificamente os casos 0,0 -> 0 e 1,1 -> 1 (e 0,1 == 1,0 na Fase 2; ou XOR exato na Fase 4)
      if (arena.mode === 'xor_gate') {
        if (activeSignal !== expected) {
          allCasesCorrect = false;
        }
      } else {
        const out00 =
          (forwardPass(topology, parameters, { dist_front: 0, floor_light: 0 }, {
            useBias,
            outputActivation: activation,
          }).outputs.jump ?? 0) >= 0.5;
        const out11 =
          (forwardPass(topology, parameters, { dist_front: 1, floor_light: 1 }, {
            useBias,
            outputActivation: activation,
          }).outputs.jump ?? 0) >= 0.5;
        const out01 =
          (forwardPass(topology, parameters, { dist_front: 0, floor_light: 1 }, {
            useBias,
            outputActivation: activation,
          }).outputs.jump ?? 0) >= 0.5;
        const out10 =
          (forwardPass(topology, parameters, { dist_front: 1, floor_light: 0 }, {
            useBias,
            outputActivation: activation,
          }).outputs.jump ?? 0) >= 0.5;

        const isValidAndOr = !out00 && out11 && out01 === out10;
        if (!isValidAndOr) {
          allCasesCorrect = false;
        }
      }

      doorOpen = allCasesCorrect;
      x += stepSpeed;

      // Porta fica em x = 440
      if (x >= 440 && !doorOpen) {
        outcome = 'collision';
        cumulativeReward -= 10;
      }
    } else {
      // Modos 'corridor' (Fase 3) e 'maze_rl' (Fase 5): Virar 15° por tick e Andar 1 unidade
      if (turnLeftOut > turnRightOut + 0.08) {
        angleDeg -= 15;
      } else if (turnRightOut > turnLeftOut + 0.08) {
        angleDeg += 15;
      }
      const rad = (angleDeg * Math.PI) / 180;
      const moveFactor = walkOut >= 0.25 ? 1 : 0.6;
      x += Math.cos(rad) * stepSpeed * moveFactor;
      y += Math.sin(rad) * stepSpeed * moveFactor;

      // Penalidade por bater nas bordas da arena ou paredes do corredor
      if (y < 28 || y > arena.height - 28) {
        outcome = 'collision';
        cumulativeReward -= 15;
      }

      for (const obs of arena.obstacles) {
        const hitX = Math.abs(x - obs.x) < obs.width / 2 + 10;
        const hitY = Math.abs(y - obs.y) < obs.height / 2 + 10;
        if (hitX && hitY && jumpTicksLeft === 0) {
          outcome = 'collision';
          cumulativeReward -= 15;
          break;
        }
      }
    }

    const reachedTarget = x >= arena.targetX - 15;
    if (outcome !== 'collision' && reachedTarget) {
      outcome = 'success';
      doorOpen = true;
      cumulativeReward += 100;
    } else if (outcome !== 'collision') {
      cumulativeReward += 1;
    }

    const frameStatus: SimulationFrame['status'] =
      outcome === 'collision'
        ? 'collision'
        : outcome === 'success'
          ? 'success'
          : tick === arena.maxTicks
            ? 'timeout'
            : 'running';

    frames.push({
      tick,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      angleDeg: Number(angleDeg.toFixed(2)),
      isJumping: isJumping || jumpTicksLeft > 0,
      jumpTicksLeft,
      sensors,
      actions,
      doorOpen,
      cumulativeReward: Number(cumulativeReward.toFixed(2)),
      status: frameStatus,
    });

    if (outcome === 'collision' || outcome === 'success') {
      break;
    }
  }

  const lastFrame = frames[frames.length - 1];
  const signature = `${config.seed}:${outcome}:${frames.length}:${lastFrame?.x ?? 0}:${lastFrame?.y ?? 0}:${lastFrame?.cumulativeReward ?? 0}`;

  return {
    seed: config.seed,
    outcome,
    frames,
    totalReward: Number(cumulativeReward.toFixed(2)),
    finalTick: frames.length,
    signature,
  };
}
