import React from 'react';
import { getDictionary, Locale } from './i18n';
import { useGameStore } from './store/useGameStore';

export function App(): React.JSX.Element {
  const { locale, activeLevelId, setLocale, setActiveLevelId } = useGameStore();
  const t = getDictionary(locale);

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

