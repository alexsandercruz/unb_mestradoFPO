# Idealizado e construido por Alexsander D. Cruz, trabalho de Fundamentos de Pesquisa Operacional - Programa de mestrado aplicado UNB - 2026.2 - PPCA.

# NeuroBot — Jogo Web Educativo de Redes Neurais

**NeuroBot** é um jogo web educativo em que estudantes do ensino médio, graduação (14+ anos) e iniciantes em Machine Learning montam redes neurais artificiais, ajustam hiperparâmetros, treinam modelos em tempo real no navegador com **TensorFlow.js** (em Web Worker) e testam um robô numa **Arena 2D determinística (Pixi.js)**.

---

## 🎯 Objetivos de Aprendizagem (Princípio *"Aprenda Fazendo, Nomeie Depois"*)

1. **Neurônio Artificial (Perceptron)**: Entradas, pesos ($w$), bias ($b$), soma ponderada ($z$) e função de ativação ($a$).
2. **Topologia de Rede**: Papel da camada de entrada (sensores), camadas ocultas e camada de saída (ações).
3. **Hiperparâmetros**: Efeito da taxa de aprendizado (`0,001–1,0`), épocas (`1–500`), inicialização de pesos e função de ativação (`step`, `sigmoid`, `relu`, `tanh`).
4. **Curva de Loss**: Interpretação da perda por época e identificação de *underfitting* e *overfitting*.
5. **Supervisionado vs. Reforço**: Diferença entre imitar exemplos rotulados (Fases 1–4) e aprender por recompensas/penalidades (Fase 5).

---

## 🏗️ Arquitetura Técnica e Stack

| Camada | Tecnologia | Papel |
| :--- | :--- | :--- |
| **Build e UI** | Vite + React 18 + TypeScript (`strict: true`) | SPA responsiva com code-splitting (`< 400 KB` gzip inicial) |
| **Estado** | Zustand (`src/store/useGameStore.ts`) | Estado reativo do editor, hiperparâmetros, fases e nuvem |
| **Editor de Rede** | React Flow + SVG Acessível (`src/features/editor/`) | Drag-and-drop, clique e teclado (`Enter`/`Espaço`/`Delete`), inspeção de $z$ e $a$ em tempo real (RF-06) |
| **Núcleo & Treino** | Pure TS `nn-core` + TensorFlow.js em Web Worker | Forward pass determinístico e treino sem travar a UI (`src/workers/train.worker.ts`) |
| **Arena 2D** | Pixi.js + Física Determinística (`src/core/simulation/`) | Simulação a 30 ticks/s com seed fixa (`42`), velocidades $0{,}5\times / 1\times / 4\times$ e Replay (RF-07) |
| **Gráficos** | Recharts (`src/features/params/`) | Curva de Loss e Recompensa ao vivo |
| **Backend & Nuvem** | Firebase Hosting, Auth, Firestore, Analytics | Login anônimo + vínculo Google preservando UID, até 10 redes salvas por fase (RF-09) |
| **Testes** | Vitest, Testing Library, Playwright | Cobertura $> 90\%$ em `src/core/*` + Teste E2E da Fase 1 (`e2e/level1.spec.ts`) |

---

## 🚀 Como Rodar Localmente

### 1. Pré-requisitos
- **Node.js** `>= 20` (recomendado `v22 LTS`)
- **npm** `>= 10`

### 2. Instalação e Configuração de Ambiente
```bash
# Instalar dependências
npm install

# Copiar exemplo de variáveis de ambiente
cp .env.example .env.local
```

Por padrão (`VITE_USE_FIREBASE_EMULATOR=true`), o jogo utiliza o emulador local integrado de Auth e Firestore (com avaliação das regras de `firestore.rules`), permitindo rodar 100% offline sem precisar de chaves externas.

### 3. Iniciar Servidor de Desenvolvimento
```bash
npm run dev
```
Acesse `http://localhost:5173`.

---

## 🧪 Como Executar os Testes e Lint

```bash
# Verificar lint (ESLint sem warnings)
npm run lint

# Executar testes unitários e de integração (Vitest)
npm test

# Executar testes com relatório de cobertura de código (meta >= 70% em src/core/*)
npm run test:coverage

# Executar teste End-to-End (Playwright) da Fase 1
npm run test:e2e
```

---

## 📦 Build de Produção e Deploy no Firebase Hosting

```bash
# Gerar pacote otimizado em dist/
npm run build

# Visualizar build de produção localmente
npm run preview
```

### Deploy Manual via Firebase CLI
```bash
# Ambiente de desenvolvimento (neurobot-dev)
npx firebase-tools use dev
npx firebase-tools deploy --only hosting,firestore:rules

# Ambiente de produção (neurobot-prod)
npx firebase-tools use prod
npx firebase-tools deploy --only hosting,firestore:rules
```

### CI/CD Automático (GitHub Actions)
O workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) executa automaticamente `npm ci`, `npm run lint`, `npm run test:coverage` e `npm run build`:
- Em **Pull Requests**: publica um canal de preview em `neurobot-dev` usando `FIREBASE_SERVICE_ACCOUNT_NEUROBOT_DEV`.
- Em **Push na `main`**: publica em produção (`live`) no projeto `neurobot-prod` usando `FIREBASE_SERVICE_ACCOUNT_NEUROBOT_PROD`.
