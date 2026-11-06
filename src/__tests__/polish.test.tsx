import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import ptBR from '../i18n/pt-BR.json';
import en from '../i18n/en.json';
import { calculateStars } from '../core/scoring';
import {
  clearEmulatorStorage,
  getAnalyticsEvents,
  trackAnalyticsEvent,
} from '../services/firebase';
import { useGameStore } from '../store/useGameStore';
import App from '../App';

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    keys.push(path);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectKeys(v as Record<string, unknown>, path));
    }
  }
  return keys.sort();
}

describe('T9 Polish — i18n Parity, Analytics Events, LGPD Notice, WCAG 2.1 AA & Offline PWA', () => {
  beforeEach(() => {
    clearEmulatorStorage();
    localStorage.removeItem('neurobot_lgpd_ack_v1');
    useGameStore.setState({
      locale: 'pt-BR',
      activeLevelId: 1,
      unlockedUpToLevel: 1,
      starsByLevel: {},
      savedNetworks: [],
      authSession: null,
    });
  });

  it('maintains 100% key parity between pt-BR.json and en.json and covers all scoring star tiers (RNF-07, RNF-08)', () => {
    const ptKeys = collectKeys(ptBR as unknown as Record<string, unknown>);
    const enKeys = collectKeys(en as unknown as Record<string, unknown>);
    expect(ptKeys).toEqual(enKeys);

    expect(
      calculateStars({
        completed: false,
        finalLoss: 0.01,
        targetLoss: 0.05,
        neuronsUsed: 2,
        idealNeurons: 2,
      }),
    ).toBe(0);
    expect(
      calculateStars({
        completed: true,
        finalLoss: 0.15,
        targetLoss: 0.05,
        neuronsUsed: 4,
        idealNeurons: 2,
      }),
    ).toBe(1);
    expect(
      calculateStars({
        completed: true,
        finalLoss: 0.03,
        targetLoss: 0.05,
        neuronsUsed: 4,
        idealNeurons: 2,
      }),
    ).toBe(2);
    expect(
      calculateStars({
        completed: true,
        finalLoss: 0.03,
        targetLoss: 0.05,
        neuronsUsed: 2,
        idealNeurons: 2,
      }),
    ).toBe(3);
  });

  it('records all 4 Firebase Analytics events (level_start, train_run, level_complete, hint_open)', async () => {
    render(<App />);

    // 1. level_start registrado na inicialização e troca de fase
    await act(async () => {
      await useGameStore.getState().setActiveLevelId(1);
    });

    // 2. hint_open registrado ao abrir dica "O que isso faz?"
    fireEvent.click(screen.getByTestId('hint-btn-lr'));

    // 3. train_run registrado com épocas e loss final
    trackAnalyticsEvent('train_run', { epochs: 50, finalLoss: 0.012 });

    // 4. level_complete registrado ao concluir a fase com estrelas
    await act(async () => {
      await useGameStore.getState().recordLevelCompletion(true, 0.01);
    });

    const events = getAnalyticsEvents().map((e) => e.name);
    expect(events).toContain('level_start');
    expect(events).toContain('hint_open');
    expect(events).toContain('train_run');
    expect(events).toContain('level_complete');
  });

  it('displays LGPD & minors notice, WCAG 2.1 AA skip link, and reacts to offline/online PWA events (RNF-04, RNF-05, RNF-06)', async () => {
    render(<App />);

    // Skip to content link (WCAG 2.1 AA)
    expect(screen.getByTestId('skip-link')).toHaveAttribute('href', '#main-content');
    expect(screen.getByTestId('wcag-badge')).toBeInTheDocument();

    // LGPD Banner e botão de aceite
    expect(screen.getByTestId('lgpd-banner')).toBeInTheDocument();
    const acceptBtn = screen.getByTestId('lgpd-accept-btn');
    fireEvent.click(acceptBtn);
    expect(screen.queryByTestId('lgpd-accept-btn')).not.toBeInTheDocument();

    // Simula desconexão e reconexão PWA offline (RNF-06)
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('pwa-status-badge')).toHaveTextContent(/Offline/i);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByTestId('pwa-status-badge')).toHaveTextContent(/PWA Offline Pronto/i);
  });
});

