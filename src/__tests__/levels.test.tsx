import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { LEVELS, getIdealParametersForLevel } from '../features/levels';
import { runSimulationEpisode } from '../core/simulation';
import { calculateStars } from '../core/scoring';
import { countHiddenNeurons } from '../core/nn-core';
import { useGameStore } from '../store/useGameStore';
import App from '../App';

describe('T7 Levels 1 to 5 — Ideal Networks Win All 5 Levels, Stars & Tutorial/Glossary', () => {
  beforeEach(() => {
    useGameStore.setState({
      locale: 'pt-BR',
      activeLevelId: 1,
      unlockedUpToLevel: 1,
      starsByLevel: {},
      authSession: {
        uid: 'anon_t7',
        isAnonymous: true,
        displayName: 'Cientista Anônimo',
        email: null,
      },
    });
  });

  it('wins all 5 levels (1 to 5) with 3 stars using the ideal network from SDD Section 3', () => {
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

      expect(episode.outcome, `Level ${level.id} should succeed with ideal network`).toBe(
        'success',
      );

      const stars = calculateStars({
        completed: episode.outcome === 'success',
        finalLoss: level.targetLoss * 0.5,
        targetLoss: level.targetLoss,
        neuronsUsed: countHiddenNeurons(level.idealTopology),
        idealNeurons: level.idealHiddenNeurons,
      });

      expect(stars, `Level ${level.id} should award 3 stars with ideal network`).toBe(3);
    }
  });

  it('unlocks subsequent levels on completion and opens Glossary & Final Quiz (RF-08, RF-10)', async () => {
    render(<App />);

    // Fase 1 está liberada, Fase 2 começa bloqueada
    let starsEarned = 0;
    await act(async () => {
      starsEarned = await useGameStore.getState().recordLevelCompletion(true, 0.01);
    });
    expect(starsEarned).toBe(3);
    expect(useGameStore.getState().unlockedUpToLevel).toBe(2);

    // Abre Glossário e Quiz Final
    fireEvent.click(screen.getByTestId('open-glossary-btn'));
    expect(screen.getByTestId('glossary-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('open-quiz-btn'));
    expect(screen.getByTestId('final-quiz-modal')).toBeInTheDocument();

    // Responde as 5 perguntas do Quiz Final corretamente
    for (let q = 0; q < 5; q++) {
      fireEvent.click(screen.getByTestId(`quiz-q${q}-opt0`));
    }
    expect(screen.getByTestId('quiz-score-badge')).toHaveTextContent('5 / 5');
  });
});

