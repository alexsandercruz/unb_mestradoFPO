import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../App';
import { useGameStore } from '../store/useGameStore';
import { calculateStars } from '../core/scoring';
import { countHiddenNeurons } from '../core/nn-core';

describe('T1 Scaffold — NeuroBot Initial Screen & Core Stubs', () => {
  beforeEach(() => {
    useGameStore.setState({
      locale: 'pt-BR',
      activeLevelId: 1,
      authSession: {
        uid: 'anon_test_user',
        isAnonymous: true,
        displayName: 'Cientista Anônimo',
        email: null,
      },
    });
  });

  it('renders initial screen in pt-BR and switches to en via i18n', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'NeuroBot' })).toBeInTheDocument();
    expect(screen.getByText(/Laboratório Interativo de Redes Neurais/i)).toBeInTheDocument();

    const select = screen.getByLabelText(/Idioma/i);
    fireEvent.change(select, { target: { value: 'en' } });

    expect(screen.getByText(/Interactive Neural Network Lab/i)).toBeInTheDocument();
  });

  it('calculates stars and hidden neurons count without React dependency', () => {
    expect(
      calculateStars({
        completed: true,
        finalLoss: 0.02,
        targetLoss: 0.05,
        neuronsUsed: 2,
        idealNeurons: 2,
      }),
    ).toBe(3);

    expect(
      countHiddenNeurons({
        inputs: ['dist_front'],
        hidden: [[{ id: 'h1', activation: 'relu' }, { id: 'h2', activation: 'relu' }]],
        outputs: ['jump'],
        links: [],
      }),
    ).toBe(2);
  });
});
