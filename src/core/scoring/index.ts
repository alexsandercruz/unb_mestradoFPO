export interface StarInput {
  completed: boolean;
  finalLoss: number;
  targetLoss: number;
  neuronsUsed: number;
  idealNeurons: number;
}

/**
 * Calcula de 0 a 3 estrelas conforme a Seção 3 do SDD:
 * - 1 estrela: desafio superado na arena;
 * - 2 estrelas: desafio superado + loss <= meta da fase;
 * - 3 estrelas: 2 estrelas + usando no máximo o número ideal de neurônios.
 */
export function calculateStars(input: StarInput): 0 | 1 | 2 | 3 {
  if (!input.completed) return 0;
  if (input.finalLoss <= input.targetLoss && input.neuronsUsed <= input.idealNeurons) {
    return 3;
  }
  if (input.finalLoss <= input.targetLoss) {
    return 2;
  }
  return 1;
}
