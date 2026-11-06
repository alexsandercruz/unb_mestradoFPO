export interface StarInput {
  completed: boolean;
  finalLoss: number;
  targetLoss: number;
  neuronsUsed: number;
  idealNeurons: number;
}

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

