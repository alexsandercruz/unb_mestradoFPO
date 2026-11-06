import React, { useEffect, useMemo } from 'react';
import { getDictionary, Locale } from './i18n';
import { useGameStore } from './store/useGameStore';
import { forwardPass, NetworkTopology } from './core/nn-core';

const DEMO_XOR_TOPOLOGY: NetworkTopology = {
  inputs: ['in1', 'in2'],
  hidden: [
    [
      { id: 'h1', activation: 'sigmoid' },
      { id: 'h2', activation: 'sigmoid' },
    ],
  ],
  outputs: ['out'],
  links: [
    ['in1', 'h1'],
    ['in2', 'h1'],
    ['in1', 'h2'],
    ['in2', 'h2'],
    ['h1', 'out'],
    ['h2', 'out'],
  ],
};

export function App(): React.JSX.Element {
  const {
    locale,
    activeLevelId,
    authSession,
    setLocale,
    setActiveLevelId,
    loginAnonymously,
    linkGoogleAccount,
  } = useGameStore();
  const t = getDictionary(locale);

  useEffect(() => {
    if (!authSession) {
      void loginAnonymously();
    }
  }, [authSession, loginAnonymously]);

  const demoForward = useMemo(() => {
    return forwardPass(
      DEMO_XOR_TOPOLOGY,
      {
        linkWeights: {
          'in1->h1': 6.0,
          'in2->h1': 6.0,
          'in1->h2': 6.0,
          'in2->h2': 6.0,
          'h1->out': 8.0,
          'h2->out': -8.0,
        },
        biases: {
          h1: -3.0,
          h2: -9.0,
          out: -3.8,
        },
      },
      { in1: 1, in2: 0 },
      { useBias: true, outputActivation: 'sigmoid' },
    );
  }, []);

  const levels = [
    { id: 1, label: t.levels.level1 },
    { id: 2, label: t.levels.level2 },
    { id: 3, label: t.levels.level3 },
    { id: 4, label: t.levels.level4 },
    { id: 5, label: t.levels.level5 },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-badge">
          <div className="brand-icon" aria-hidden="true">
            NB
          </div>
          <div>
            <h1 className="app-title">{t.app.title}</h1>
            <p className="app-subtitle">{t.app.subtitle}</p>
          </div>
        </div>

        <div className="header-controls">
          <div className="auth-bar" data-testid="auth-bar">
            <span className="emulator-badge">{t.auth.emulatorActive}</span>
            {authSession ? (
              <>
                <span className="auth-status-badge" data-testid="auth-status-badge">
                  {authSession.isAnonymous ? t.auth.anonymousBadge : t.auth.googleBadge}
                </span>
                <code className="uid-pill" data-testid="auth-uid">
                  {t.auth.uidLabel}: {authSession.uid}
                </code>
                {authSession.isAnonymous && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => void linkGoogleAccount()}
                  >
                    {t.auth.linkGoogle}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void loginAnonymously()}
              >
                {t.auth.signInAnonymous}
              </button>
            )}
          </div>

          <div className="locale-switcher">
            <label htmlFor="locale-select">{t.app.languageLabel}:</label>
            <select
              id="locale-select"
              className="locale-select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              <option value="pt-BR">{t.app.LocalePt}</option>
              <option value="en">{t.app.LocaleEn}</option>
            </select>
          </div>
        </div>
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <section className="hero-card" aria-labelledby="hero-description">
          <span className="status-pill">{t.app.statusReady}</span>
          <p id="hero-description">{t.app.description}</p>
          <div className="steps-grid">
            <div className="step-card">{t.steps.build}</div>
            <div className="step-card">{t.steps.tune}</div>
            <div className="step-card">{t.steps.train}</div>
            <div className="step-card">{t.steps.test}</div>
          </div>
        </section>

        <section className="levels-card" aria-labelledby="nncore-heading">
          <h2 id="nncore-heading">{t.nnCore.heading}</h2>
          <span className="status-pill">{t.nnCore.convergenceBadge}</span>
          <div className="steps-grid">
            <div className="step-card">{t.nnCore.forwardLabel}</div>
            <div className="step-card">
              {t.nnCore.weightedSumLabel}: {demoForward.neurons.out.weightedSum.toFixed(3)}
            </div>
            <div className="step-card">
              {t.nnCore.activationLabel}: {demoForward.outputs.out.toFixed(4)}
            </div>
          </div>
        </section>

        <section className="levels-card" aria-labelledby="levels-heading">
          <h2 id="levels-heading">{t.levels.heading}</h2>
          <ul className="levels-list">
            {levels.map((lvl) => (
              <li
                key={lvl.id}
                className={`level-item ${activeLevelId === lvl.id ? 'active' : ''}`}
                onClick={() => setActiveLevelId(lvl.id)}
              >
                <span>{lvl.label}</span>
              </li>
            ))}
          </ul>
          <div>
            <button type="button" className="primary-btn" onClick={() => setActiveLevelId(1)}>
              {t.actions.start}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
