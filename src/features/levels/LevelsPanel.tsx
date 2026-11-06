import React, { useState } from 'react';
import { getDictionary, Locale } from '../../i18n';
import { LEVELS, LevelDefinition } from './index';

export interface LevelsPanelProps {
  locale: Locale;
  activeLevelNumber: number;
  unlockedUpTo: number;
  starsByLevel: Record<string, 0 | 1 | 2 | 3>;
  onSelectLevel: (levelNumber: number) => void;
  onLoadIdealNetwork: (level: LevelDefinition) => void;
}

export function LevelsPanel({
  locale,
  activeLevelNumber,
  unlockedUpTo,
  starsByLevel,
  onSelectLevel,
  onLoadIdealNetwork,
}: LevelsPanelProps): React.JSX.Element {
  const t = getDictionary(locale);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});

  const activeLevel = LEVELS.find((l) => l.levelNumber === activeLevelNumber) ?? LEVELS[0];
  const totalStars = Object.values(starsByLevel).reduce<number>((acc, s) => acc + s, 0);

  const renderStars = (count: number) => {
    return `${'★'.repeat(count)}${'☆'.repeat(3 - count)}`;
  };

  const quizScore = t.levels.quizQuestions.reduce((acc, q, idx) => {
    return acc + (quizAnswers[idx] === q.correct ? 1 : 0);
  }, 0);

  return (
    <section className="levels-card" aria-labelledby="levels-heading">
      <div className="editor-header-row">
        <div>
          <h2 id="levels-heading">{t.levels.heading}</h2>
          <p className="editor-instructions">
            <strong>{activeLevel.title[locale]}:</strong> {activeLevel.challenge[locale]} —{' '}
            <em>{activeLevel.concept[locale]}</em>
          </p>
        </div>

        <div className="toolbar-actions">
          <span className="status-pill" data-testid="total-stars-badge">
            ★ {t.levels.totalStars.replace('{stars}', String(totalStars))}
          </span>
          <button
            type="button"
            className="secondary-btn"
            data-testid="open-glossary-btn"
            onClick={() => setShowGlossary((v) => !v)}
          >
            📖 {t.levels.glossaryBtn}
          </button>
          <button
            type="button"
            className="secondary-btn"
            data-testid="open-quiz-btn"
            onClick={() => setShowQuiz((v) => !v)}
          >
            🎓 {t.levels.quizBtn}
          </button>
        </div>
      </div>

      {/* Seletor das 5 Fases com Estrelas (1 a 3) e Desbloqueio (RF-08) */}
      <ul className="levels-list">
        {LEVELS.map((lvl) => {
          const isUnlocked = lvl.levelNumber <= unlockedUpTo;
          const isActive = lvl.levelNumber === activeLevelNumber;
          const stars = starsByLevel[lvl.id] ?? 0;

          return (
            <li
              key={lvl.id}
              data-testid={`level-item-${lvl.levelNumber}`}
              className={`level-item ${isActive ? 'active' : ''}`}
              style={{
                opacity: isUnlocked ? 1 : 0.55,
                cursor: isUnlocked ? 'pointer' : 'not-allowed',
              }}
              onClick={() => {
                if (isUnlocked) {
                  onSelectLevel(lvl.levelNumber);
                }
              }}
            >
              <div>
                <strong>{lvl.title[locale]}</strong> — {lvl.challenge[locale]}
                <div className="editor-instructions">{lvl.concept[locale]}</div>
              </div>
              <div className="toolbar-actions">
                <span className="uid-pill" data-testid={`level-stars-${lvl.levelNumber}`}>
                  {renderStars(stars)}
                </span>
                <span className="emulator-badge">
                  {isUnlocked ? t.levels.unlocked : `🔒 ${t.levels.locked}`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Tutorial Guiado + Tabela de Exemplos Supervisionados / Recompensa */}
      <div className="editor-bottom-grid">
        <div className="inspector-box" data-testid="guided-tutorial-box">
          <h3>{t.levels.tutorialHeading}</h3>
          <ol
            style={{
              paddingLeft: '1.2rem',
              display: 'grid',
              gap: '0.4rem',
              fontSize: '0.86rem',
            }}
          >
            {activeLevel.tutorial[locale].map((stepText, idx) => (
              <li key={idx}>{stepText}</li>
            ))}
          </ol>
          <div style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              className="primary-btn"
              data-testid="load-ideal-network-btn"
              onClick={() => onLoadIdealNetwork(activeLevel)}
            >
              ⚡ {t.levels.loadIdealBtn}
            </button>
          </div>
        </div>

        <div className="inspector-box" data-testid="level-dataset-box">
          <h3>
            {activeLevel.levelNumber === 5 ? t.levels.rewardHeading : t.levels.datasetHeading}
          </h3>
          {activeLevel.rewardRules && (
            <div className="telemetry-pills" style={{ marginBottom: '0.4rem' }}>
              <span className="uid-pill">Alvo: +{activeLevel.rewardRules.reachGoal}</span>
              <span className="uid-pill">Passo seguro: +{activeLevel.rewardRules.stepAlive}</span>
              <span className="uid-pill">Colisão: {activeLevel.rewardRules.collisionPenalty}</span>
            </div>
          )}
          <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #475569' }}>
                <th style={{ padding: '0.25rem' }}>
                  {t.levels.inputsCol} ({activeLevel.allowedInputs.join(', ')})
                </th>
                <th style={{ padding: '0.25rem' }}>
                  {t.levels.targetsCol} ({activeLevel.allowedOutputs.join(', ')})
                </th>
              </tr>
            </thead>
            <tbody>
              {activeLevel.dataset.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '0.25rem' }}>[{row.inputs.join(', ')}]</td>
                  <td style={{ padding: '0.25rem' }}>[{row.targets.join(', ')}]</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Glossário de ML acessível a qualquer momento (RF-10) */}
      {showGlossary && (
        <div className="inspector-box" data-testid="glossary-modal">
          <h3>{t.levels.glossaryTitle}</h3>
          <div style={{ display: 'grid', gap: '0.55rem', fontSize: '0.86rem' }}>
            {t.levels.glossaryItems.map((item, idx) => (
              <div key={idx}>
                <strong>{item.term}:</strong> {item.def}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quiz Final de 5 Perguntas (Seção 7 — Definição de Pronto) */}
      {showQuiz && (
        <div className="inspector-box" data-testid="final-quiz-modal">
          <div className="editor-header-row">
            <h3>{t.levels.quizTitle}</h3>
            <span className="status-pill" data-testid="quiz-score-badge">
              {t.levels.quizScore.replace('{score}', String(quizScore))}
            </span>
          </div>
          <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.86rem' }}>
            {t.levels.quizQuestions.map((qItem, qIdx) => (
              <div key={qIdx} style={{ display: 'grid', gap: '0.3rem' }}>
                <strong>{qItem.q}</strong>
                {qItem.options.map((opt, oIdx) => (
                  <label key={oIdx} style={{ display: 'flex', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`quiz-q-${qIdx}`}
                      checked={quizAnswers[qIdx] === oIdx}
                      data-testid={`quiz-q${qIdx}-opt${oIdx}`}
                      onChange={() =>
                        setQuizAnswers((prev) => ({
                          ...prev,
                          [qIdx]: oIdx,
                        }))
                      }
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
