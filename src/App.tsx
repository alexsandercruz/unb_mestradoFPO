import React, { useEffect, useState } from 'react';
import { getDictionary, Locale } from './i18n';
import { useGameStore } from './store/useGameStore';
import { NeuronEditor } from './features/editor/NeuronEditor';
import { ParamsPanel } from './features/params/ParamsPanel';
import { ArenaView } from './features/arena/ArenaView';
import { LevelsPanel, getLevelByNumber } from './features/levels/LevelsPanelWrapper';
import { getAnalyticsEvents, trackAnalyticsEvent } from './services/firebase';

const LGPD_ACK_KEY = 'neurobot_lgpd_ack_v1';

export function App(): React.JSX.Element {
  const {
    locale,
    activeLevelId,
    unlockedUpToLevel,
    starsByLevel,
    savedNetworks,
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
    saveCurrentNetwork,
    loadSavedNetwork,
    hydrateFromCloud,
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

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [lgpdAccepted, setLgpdAccepted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LGPD_ACK_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [analyticsCount, setAnalyticsCount] = useState<number>(() => getAnalyticsEvents().length);

  useEffect(() => {
    if (!authSession) {
      void loginAnonymously();
    }
    if (getAnalyticsEvents().length === 0) {
      trackAnalyticsEvent('level_start', { levelId: '01-first-step', levelNumber: 1 });
      setAnalyticsCount(getAnalyticsEvents().length);
    }
  }, [authSession, loginAnonymously]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void hydrateFromCloud();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [hydrateFromCloud]);

  const handleAcceptLgpd = () => {
    setLgpdAccepted(true);
    try {
      localStorage.setItem(LGPD_ACK_KEY, 'true');
    } catch {
      // ignore
    }
  };

  const activeLevel = getLevelByNumber(activeLevelId);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link" data-testid="skip-link">
        {t.polish.skipToContent}
      </a>

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
            <span className="emulator-badge" data-testid="pwa-status-badge">
              {isOnline ? t.polish.pwaReady : t.polish.pwaOfflineMode}
            </span>
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
                    data-testid="link-google-btn"
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

      <main id="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <section className="hero-card" aria-labelledby="hero-description">
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="status-pill">{t.app.statusReady}</span>
            <span className="emulator-badge" data-testid="wcag-badge">
              {t.polish.wcagBadge}
            </span>
            <span className="emulator-badge" data-testid="analytics-badge">
              {t.polish.analyticsTitle.replace('{count}', String(analyticsCount))}
            </span>
          </div>
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
          savedNetworks={savedNetworks}
          onSelectLevel={(id) => {
            void setActiveLevelId(id).then(() => setAnalyticsCount(getAnalyticsEvents().length));
          }}
          onLoadIdealNetwork={loadIdealNetworkForLevel}
          onSaveCurrentNetwork={saveCurrentNetwork}
          onLoadSavedNetwork={loadSavedNetwork}
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
          onTrainingMetricUpdate={(_ep, loss) => {
            setLastTrainingLoss(loss);
            setAnalyticsCount(getAnalyticsEvents().length);
          }}
          onHintOpen={() => setAnalyticsCount(getAnalyticsEvents().length)}
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
            void recordLevelCompletion(res.outcome === 'success').then(() =>
              setAnalyticsCount(getAnalyticsEvents().length),
            );
          }}
        />
      </main>

      <footer className="lgpd-footer" data-testid="lgpd-banner" role="contentinfo">
        <div className="lgpd-content">
          <strong>🛡️ {t.polish.lgpdTitle}:</strong> <span>{t.polish.lgpdText}</span>
        </div>
        {!lgpdAccepted && (
          <button
            type="button"
            className="secondary-btn"
            data-testid="lgpd-accept-btn"
            onClick={handleAcceptLgpd}
          >
            ✓ {t.polish.lgpdAcceptBtn}
          </button>
        )}
      </footer>
    </div>
  );
}

export default App;
