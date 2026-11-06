import React, { useEffect } from 'react';
import { getDictionary, Locale } from './i18n';
import { useGameStore } from './store/useGameStore';
import { NeuronEditor } from './features/editor/NeuronEditor';
import { ParamsPanel } from './features/params/ParamsPanel';
import { DatasetSample } from './core/nn-core';

const DEFAULT_XOR_DATASET: DatasetSample[] = [
  { inputs: [0, 0], targets: [0] },
  { inputs: [0, 1], targets: [1] },
  { inputs: [1, 0], targets: [1] },
  { inputs: [1, 1], targets: [0] },
];

export function App(): React.JSX.Element {
  const {
    locale,
    activeLevelId,
    authSession,
    topology,
    parameters,
    learningRate,
    epochs,
    activation,
    weightInit,
    useBias,
    setLocale,
    setActiveLevelId,
    setTopology,
    setParameters,
    setLearningRate,
    setEpochs,
    setActivation,
    setWeightInit,
    setUseBias,
    loginAnonymously,
    linkGoogleAccount,
  } = useGameStore();
  const t = getDictionary(locale);

  useEffect(() => {
    if (!authSession) {
      void loginAnonymously();
    }
  }, [authSession, loginAnonymously]);

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

        <NeuronEditor
          locale={locale}
          topology={topology}
          parameters={parameters}
          activation={activation}
          useBias={useBias}
          limits={{
            allowedInputs: ['dist_front', 'floor_light', 'dist_left', 'dist_right', 'target_angle'],
            allowedOutputs: ['jump', 'walk', 'turn_left', 'turn_right'],
            maxHiddenLayers: 2,
            maxHiddenNeurons: 6,
          }}
          onChangeTopology={setTopology}
        />

        <ParamsPanel
          locale={locale}
          topology={topology}
          parameters={parameters}
          learningRate={learningRate}
          epochs={epochs}
          activation={activation}
          weightInit={weightInit}
          useBias={useBias}
          dataset={DEFAULT_XOR_DATASET}
          targetLoss={0.05}
          allowManualWeights={activeLevelId <= 2}
          isReinforcementLevel={activeLevelId === 5}
          onChangeLearningRate={setLearningRate}
          onChangeEpochs={setEpochs}
          onChangeActivation={setActivation}
          onChangeWeightInit={setWeightInit}
          onChangeUseBias={setUseBias}
          onChangeParameters={setParameters}
        />

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
