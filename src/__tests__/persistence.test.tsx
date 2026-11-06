import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/useGameStore';
import { getIdealParametersForLevel, getUntunedParametersForLevel } from '../features/levels';

describe('T8 State & Dynamic Loss Evaluation — Weight Tuning & Progression', () => {
  beforeEach(() => {
    useGameStore.setState({
      locale: 'pt-BR',
      activeLevelId: 1,
      unlockedUpToLevel: 1,
      starsByLevel: {},
      parameters: getUntunedParametersForLevel(1),
    });
  });

  it('starts levels with high untuned loss and lowers loss below target when weights are tuned', async () => {
    await useGameStore.getState().setActiveLevelId(1);
    const initialLoss = useGameStore.getState().lastTrainingLoss;
    expect(initialLoss).toBeGreaterThan(0.15);

    // Quando o jogador ajusta os pesos para valores calibrados, a loss cai abaixo da meta (<= 0.05)
    useGameStore.getState().setParameters(getIdealParametersForLevel(1));
    const tunedLoss = useGameStore.getState().lastTrainingLoss;
    expect(tunedLoss).toBeLessThan(0.05);

    const stars = await useGameStore.getState().recordLevelCompletion(true);
    expect(stars).toBe(3);
    expect(useGameStore.getState().unlockedUpToLevel).toBe(2);
  });
});
