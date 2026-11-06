import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DEFAULT_ARENA_MAP, runSimulationEpisode } from '../core/simulation';
import { NetworkParameters, NetworkTopology } from '../core/nn-core';
import { ArenaView } from '../features/arena/ArenaView';

const LEVEL1_IDEAL_TOPOLOGY: NetworkTopology = {
  inputs: ['dist_front'],
  hidden: [],
  outputs: ['jump'],
  links: [['dist_front', 'jump']],
};

const LEVEL1_IDEAL_PARAMS: NetworkParameters = {
  linkWeights: { 'dist_front->jump': 2.5 },
  biases: { jump: -1.0 },
};

describe('T6 Arena & Robot Simulation — Deterministic Seed (10 runs) & Replay Controls', () => {
  it('produces the exact same outcome, trajectory and signature across 10 consecutive runs with the same network and seed', () => {
    const runs = Array.from({ length: 10 }, () =>
      runSimulationEpisode({
        seed: 42,
        tickRateHz: 30,
        topology: LEVEL1_IDEAL_TOPOLOGY,
        parameters: LEVEL1_IDEAL_PARAMS,
        activation: 'step',
        useBias: true,
        arena: DEFAULT_ARENA_MAP,
      }),
    );

    const first = runs[0];
    expect(first.outcome).toBe('success');

    for (let i = 1; i < 10; i++) {
      expect(runs[i].outcome).toBe(first.outcome);
      expect(runs[i].finalTick).toBe(first.finalTick);
      expect(runs[i].totalReward).toBe(first.totalReward);
      expect(runs[i].signature).toBe(first.signature);
      expect(runs[i].frames).toEqual(first.frames);
    }
  });

  it('renders ArenaView with 0.5x, 1x, 4x speed selectors and triggers episode replay (RF-07)', () => {
    render(
      <ArenaView
        locale="pt-BR"
        seed={42}
        topology={LEVEL1_IDEAL_TOPOLOGY}
        parameters={LEVEL1_IDEAL_PARAMS}
        activation="step"
        useBias={true}
      />,
    );

    const speed05 = screen.getByTestId('speed-btn-0.5x');
    const speed1 = screen.getByTestId('speed-btn-1x');
    const speed4 = screen.getByTestId('speed-btn-4x');
    expect(speed05).toBeInTheDocument();
    expect(speed1).toBeInTheDocument();
    expect(speed4).toBeInTheDocument();

    fireEvent.click(speed4);
    fireEvent.click(screen.getByTestId('run-arena-btn'));
    expect(screen.getByTestId('replay-arena-btn')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('replay-arena-btn'));
    expect(screen.getByTestId('arena-outcome-banner')).toHaveTextContent(/Replay/i);
  });
});
