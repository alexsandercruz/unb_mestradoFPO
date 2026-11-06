import React, { useEffect } from 'react';
import { getDictionary, Locale } from './i18n';
import { useGameStore } from './store/useGameStore';
import { NeuronEditor } from './features/editor/NeuronEditor';
import { ParamsPanel } from './features/params/ParamsPanel';
import { ArenaView } from './features/arena/ArenaView';
import { LevelsPanel, getLevelByNumber } from './features/levels/LevelsPanelWrapper';

export function App(): React.JSX.Element {
  const {
    locale,
    activeLevelId,
    unlockedUpToLevel,
    starsByLevel,
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
    loadIdealNetworkForLevel,
    recordLevelCompletion,
    setLastTrainingLoss,
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

  const activeLevel = getLevelByNumber(activeLevelId);

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

        <LevelsPanel
          locale={locale}
          activeLevelNumber={activeLevelId}
          unlockedUpTo={unlockedUpToLevel}
          starsByLevel={starsByLevel}
          onSelectLevel={setActiveLevelId}
          onLoadIdealNetwork={loadIdealNetworkForLevel}
        />

        <NeuronEditor
          locale={locale}
          topology={topology}
          parameters={parameters}
          activation={activation}
          useBias={useBias}
          limits={{
            allowedInputs: activeLevel.allowedInputs,
            allowedOutputs: activeLevel.allowedOutputs,
            maxHiddenLayers: Math.max(1, activeLevel.maxHiddenLayers),
            maxHiddenNeurons: Math.max(2, activeLevel.maxHiddenNeurons),
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
          dataset={activeLevel.dataset}
          targetLoss={activeLevel.targetLoss}
          allowManualWeights={activeLevelId <= 2}
          isReinforcementLevel={activeLevelId === 5}
          onChangeLearningRate={setLearningRate}
          onChangeEpochs={setEpochs}
          onChangeActivation={setActivation}
          onChangeWeightInit={setWeightInit}
          onChangeUseBias={setUseBias}
          onChangeParameters={setParameters}
          onTrainingMetricUpdate={(_ep, loss) => setLastTrainingLoss(loss)}
        />

        <ArenaView
          locale={locale}
          seed={42}
          topology={topology}
          parameters={parameters}
          activation={activation}
          useBias={useBias}
          arenaMap={activeLevel.arena}
          onEpisodeComplete={(res) => {
            recordLevelCompletion(res.outcome === 'success');
          }}
        />
      </main>
    </div>
  );
}

export default App;
