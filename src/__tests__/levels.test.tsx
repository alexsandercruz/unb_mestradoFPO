import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  LEVELS,
  getIdealParametersForLevel,
  getUntunedParametersForLevel,
} from '../features/levels';
import { runSimulationEpisode } from '../core/simulation';
import { calculateStars } from '../core/scoring';
import { countHiddenNeurons } from '../core/nn-core';
import { useGameStore } from '../store/useGameStore';
import App from '../App';

describe('T7 Levels 1 to 5 — Untuned Networks Fail, Tuned/Trained Networks Win All 5 Levels', () => {
  beforeEach(() => {
    useGameStore.setState({
      locale: 'pt-BR',
      activeLevelId: 1,
      unlockedUpToLevel: 1,
      starsByLevel: {},
    });
  });

  it('requires weight tuning or training: untuned initial parameters collide on all 5 levels', () => {
    for (const level of LEVELS) {
      const untunedParams = getUntunedParametersForLevel(level.levelNumber);
      const episode = runSimulationEpisode({
        seed: 42,
        tickRateHz: 30,
        topology: level.idealTopology,
        parameters: untunedParams,
        activation: level.defaultActivation,
        useBias: true,
        arena: level.arena,
      });

      expect(
        episode.outcome,
        `Level ${level.id} must fail when weights are not tuned or trained`,
      ).not.toBe('success');
    }
  });

  it('wins all 5 levels (1 to 5) with 3 stars once weights are properly tuned or trained', () => {
    for (const level of LEVELS) {
      const idealParams = getIdealParametersForLevel(level.levelNumber);
      const episode = runSimulationEpisode({
        seed: 42,
        tickRateHz: 30,
        topology: level.idealTopology,
        parameters: idealParams,
        activation: level.defaultActivation,
        useBias: true,
        arena: level.arena,
      });

      expect(episode.outcome, `Level ${level.id} should succeed with tuned network`).toBe(
        'success',
      );

      const stars = calculateStars({
        completed: episode.outcome === 'success',
        finalLoss: level.targetLoss * 0.5,
        targetLoss: level.targetLoss,
        neuronsUsed: countHiddenNeurons(level.idealTopology),
        idealNeurons: level.idealHiddenNeurons,
      });

      expect(stars, `Level ${level.id} should award 3 stars with tuned network`).toBe(3);
    }
  });

  it('unlocks subsequent levels on completion and opens Glossary & Final Quiz (RF-08, RF-10)', async () => {
    render(<App />);

    let starsEarned = 0;
    await act(async () => {
      starsEarned = await useGameStore.getState().recordLevelCompletion(true, 0.01);
    });
    expect(starsEarned).toBe(3);
    expect(useGameStore.getState().unlockedUpToLevel).toBe(2);

    fireEvent.click(screen.getByTestId('open-glossary-btn'));
    expect(screen.getByTestId('glossary-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('open-quiz-btn'));
    expect(screen.getByTestId('final-quiz-modal')).toBeInTheDocument();

    for (let q = 0; q < 5; q++) {
      fireEvent.click(screen.getByTestId(`quiz-q${q}-opt0`));
    }
    expect(screen.getByTestId('quiz-score-badge')).toHaveTextContent('5 / 5');
  });
});
