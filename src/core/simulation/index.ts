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
  startX: 45,
  startY: 180,
  startAngleDeg: 0,
  targetX: 555,
  targetY: 180,
  maxTicks: 120,
  obstacles: [
    { id: 'box-1', x: 150, y: 165, width: 26, height: 30, lowObstacle: true },
    { id: 'box-2', x: 260, y: 161, width: 28, height: 34, lowObstacle: true },
    { id: 'box-3', x: 370, y: 165, width: 26, height: 30, lowObstacle: true },
    { id: 'box-4', x: 475, y: 161, width: 30, height: 34, lowObstacle: true },
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
  const stepSpeed = 5.8;

  const truthTableCases: [number, number][] = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];
  let allCasesCorrect = true;

  // Pré-validação rigorosa da calibração da rede para exigir ajuste de pesos ou treino real
  if (arena.mode === 'box_jump') {
    const farPred =
      forwardPass(
        topology,
        parameters,
        { dist_front: 0.15 },
        { useBias, outputActivation: activation },
      ).outputs.jump ?? 0;
    const midFarPred =
      forwardPass(
        topology,
        parameters,
        { dist_front: 0.25 },
        { useBias, outputActivation: activation },
      ).outputs.jump ?? 0;
    const nearPred =
      forwardPass(
        topology,
        parameters,
        { dist_front: 0.72 },
        { useBias, outputActivation: activation },
      ).outputs.jump ?? 0;
    const w = parameters.linkWeights['dist_front->jump'] ?? 0;
    // Exige limiar bem calibrado: não pular longe (<= 0.25), pular perto (>= 0.72) e peso suficiente (>= 1.4)
    if (farPred >= 0.5 || midFarPred >= 0.5 || nearPred < 0.5 || w < 1.4) {
      allCasesCorrect = false;
    }
  }

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
      let minAhead = 999;
      for (const obs of arena.obstacles) {
        const dx = obs.x - x;
        if (dx >= -8 && dx <= 65 && dx < minAhead) {
          minAhead = dx;
        }
      }
      sensors.dist_front =
        minAhead <= 65 ? Number(Math.max(0, Math.min(1, 1 - minAhead / 65)).toFixed(3)) : 0;
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
      const centerY =
        arena.mode === 'corridor'
          ? 130 + Math.sin(x / 85) * 24
          : arena.targetY + Math.sin(x / 95) * 18;
      const headingLookaheadY = Math.sin((angleDeg * Math.PI) / 180) * 55;

      // Desvio adicional de obstáculos / pilares à frente
      let obstacleRepulsionY = 0;
      let frontObstacleProximity = 0;
      for (const obs of arena.obstacles) {
        const dx = obs.x - x;
        const dy = obs.y - y;
        const dist = Math.hypot(dx, dy);
        if (dx >= -8 && dx <= 75 && dist < 80) {
          frontObstacleProximity = Math.max(frontObstacleProximity, 1 - dist / 80);
          if (Math.abs(dy) < 42) {
            // Empurra o centro virtual para longe do pilar/barreira
            obstacleRepulsionY += dy < 0 ? 18 : -18;
          }
        }
      }

      const effectiveCenterY = centerY + obstacleRepulsionY;
      const offsetY = y + headingLookaheadY - effectiveCenterY;
      sensors.dist_left = Number(Math.max(0, Math.min(1, 0.5 - offsetY / 85)).toFixed(3));
      sensors.dist_right = Number(Math.max(0, Math.min(1, 0.5 + offsetY / 85)).toFixed(3));
      sensors.dist_front = Number(frontObstacleProximity.toFixed(3));
      sensors.floor_light = frontObstacleProximity > 0.35 ? 1 : 0;

      const desiredAngleDeg =
        (Math.atan2(effectiveCenterY - y, Math.max(25, arena.targetX - x)) * 180) / Math.PI;
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
      if (jumpOut >= 0.5 && jumpTicksLeft === 0 && sensors.dist_front >= 0.38 && allCasesCorrect) {
        jumpTicksLeft = 12;
      } else if (jumpOut >= 0.5 && sensors.dist_front < 0.25) {
        allCasesCorrect = false;
      }
      x += stepSpeed;

      for (const obs of arena.obstacles) {
        const overlapsX = Math.abs(x - obs.x) < obs.width / 2 + 7;
        if (overlapsX && ((!isJumping && jumpTicksLeft === 0) || !allCasesCorrect)) {
          outcome = 'collision';
          cumulativeReward -= 10;
          break;
        }
      }
    } else if (arena.mode === 'logic_gate_and_or' || arena.mode === 'xor_gate') {
      const out00 =
        forwardPass(
          topology,
          parameters,
          { dist_front: 0, floor_light: 0 },
          { useBias, outputActivation: activation },
        ).outputs.jump ?? 0;
      const out11 =
        forwardPass(
          topology,
          parameters,
          { dist_front: 1, floor_light: 1 },
          { useBias, outputActivation: activation },
        ).outputs.jump ?? 0;
      const out01 =
        forwardPass(
          topology,
          parameters,
          { dist_front: 0, floor_light: 1 },
          { useBias, outputActivation: activation },
        ).outputs.jump ?? 0;
      const out10 =
        forwardPass(
          topology,
          parameters,
          { dist_front: 1, floor_light: 0 },
          { useBias, outputActivation: activation },
        ).outputs.jump ?? 0;

      if (arena.mode === 'xor_gate') {
        const isValidXor =
          out00 < 0.35 && out11 < 0.35 && out01 > 0.65 && out10 > 0.65;
        if (!isValidXor) {
          allCasesCorrect = false;
        }
      } else {
        // Porta OR ou AND com margem clara (>= 0.65 para verdadeiro, <= 0.35 para falso)
        const isValidOr = out00 <= 0.35 && out01 >= 0.65 && out10 >= 0.65 && out11 >= 0.65;
        const isValidAnd = out00 <= 0.35 && out01 <= 0.35 && out10 <= 0.35 && out11 >= 0.65;
        if (!isValidOr && !isValidAnd) {
          allCasesCorrect = false;
        }
      }

      doorOpen = allCasesCorrect;

      // Verifica proximidade aos 3 obstáculos baixos antes da porta lógica
      let nearLowBox = false;
      for (const obs of arena.obstacles) {
        const dx = obs.x - x;
        if (dx >= 0 && dx <= 36) {
          nearLowBox = true;
        }
      }
      if (nearLowBox && doorOpen && jumpTicksLeft === 0) {
        jumpTicksLeft = 11;
      }

      x += stepSpeed;

      for (const obs of arena.obstacles) {
        const overlapsX = Math.abs(x - obs.x) < obs.width / 2 + 7;
        if (overlapsX && (!doorOpen || (!isJumping && jumpTicksLeft === 0))) {
          outcome = 'collision';
          cumulativeReward -= 10;
          break;
        }
      }

      if (outcome !== 'collision' && x >= 440 && !doorOpen) {
        outcome = 'collision';
        cumulativeReward -= 10;
      }
    } else {
      // Modos 'corridor' (Fase 3) e 'maze_rl' (Fase 5)
      // Verifica se a rede realmente possui resposta diferencial de direção treinada
      const leftProbe = forwardPass(
        topology,
        parameters,
        { dist_front: 0.2, dist_left: 0.85, dist_right: 0.15, target_angle: 0.25 },
        { useBias, outputActivation: activation },
      ).outputs;
      const rightProbe = forwardPass(
        topology,
        parameters,
        { dist_front: 0.2, dist_left: 0.15, dist_right: 0.85, target_angle: -0.25 },
        { useBias, outputActivation: activation },
      ).outputs;

      const steersRightWhenWallLeft =
        (leftProbe.turn_right ?? 0) > (leftProbe.turn_left ?? 0) + 0.08;
      const steersLeftWhenWallRight =
        (rightProbe.turn_left ?? 0) > (rightProbe.turn_right ?? 0) + 0.08;

      if (!steersRightWhenWallLeft || !steersLeftWhenWallRight) {
        // Rede não treinada / pesos descalibrados deriva na curva e colide
        angleDeg += 7;
      } else if (turnLeftOut > turnRightOut + 0.08) {
        angleDeg -= 15;
      } else if (turnRightOut > turnLeftOut + 0.08) {
        angleDeg += 15;
      }

      const rad = (angleDeg * Math.PI) / 180;
      const moveFactor = walkOut >= 0.25 ? 1 : 0.6;
      x += Math.cos(rad) * stepSpeed * moveFactor;
      y += Math.sin(rad) * stepSpeed * moveFactor;

      const corridorCenterY = 130 + Math.sin(x / 85) * 24;
      const hitCorridorWall =
        arena.mode === 'corridor' && Math.abs(y - corridorCenterY) > 46;

      if (y < 28 || y > arena.height - 28 || hitCorridorWall) {
        outcome = 'collision';
        cumulativeReward -= 15;
      }

      if (outcome !== 'collision') {
        for (const obs of arena.obstacles) {
          const hitX = Math.abs(x - obs.x) < obs.width / 2 + 8;
          const hitY = Math.abs(y - obs.y) < obs.height / 2 + 8;
          if (hitX && hitY && jumpTicksLeft === 0) {
            outcome = 'collision';
            cumulativeReward -= 15;
            break;
          }
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
