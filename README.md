# NeuroBot — Jogo Web Educativo de Redes Neurais

> **Idealizado e construído por Alexsander D. Cruz**
> Trabalho da disciplina **Fundamentos em Pesquisa Operacional (FPO)**
> **Programa de Pós-Graduação em Computação Aplicada (PPCA)** — Mestrado Profissional — **Universidade de Brasília (UnB) — 2026.2**

---

## 📖 Visão Geral

**NeuroBot** é um jogo web interativo em que estudantes do ensino médio e graduação (14+ anos) e iniciantes em Aprendizado de Máquina (*Machine Learning*) montam pequenas redes neurais artificiais, ajustam seus hiperparâmetros, treinam-nas em tempo real diretamente no navegador com **TensorFlow.js** (executando em *Web Worker*) e testam um robô autônomo em uma **Arena 2D determinística (Pixi.js)**.

Toda a aplicação adota o princípio pedagógico **"aprenda fazendo, nomeie depois"**: cada conceito aparece primeiro como mecânica prática de jogo e só depois recebe a nomenclatura formal.

---

## 🎯 Objetivos de Aprendizagem

Ao concluir as 5 fases do jogo, o estudante é capaz de:

1. **Explicar o funcionamento de um neurônio artificial (*Perceptron*)**: entradas, pesos ($w$), limiar (*bias* $b$), soma ponderada ($z$) e função de ativação ($a$).
2. **Montar uma topologia em camadas**: compreender o papel da camada de entrada (sensores do robô), das camadas ocultas e da camada de saída (ações).
3. **Ajustar hiperparâmetros**: observar na prática o efeito da taxa de aprendizado (`0,001–1,0`), do número de épocas (`1–500`), da inicialização de pesos e da função de ativação (`step`, `sigmoid`, `relu`, `tanh`).
4. **Interpretar curvas de aprendizado**: ler o gráfico de perda (*loss*) por época e reconhecer *underfitting* e *overfitting*.
5. **Diferenciar paradigmas de aprendizado**: contrastar o **aprendizado supervisionado** (imitar exemplos rotulados nas Fases 1–4) com o **aprendizado por reforço** (maximizar recompensas e evitar penalidades na Fase 5).

---

## 🎮 Mecânicas e As 5 Fases do Jogo

Cada fase segue o ciclo de 4 passos:
1. **Montar (Editor de Neurônios)**: arrastar ou ativar via teclado sensores (entradas), neurônios ocultos e ações (saídas), conectando-os com cabos (espessura = magnitude $|w|$; azul sólido `+` = peso positivo; laranja tracejado `−` = peso negativo).
2. **Ajustar (Painel de Parâmetros)**: configurar taxa de aprendizado, épocas, função de ativação, *bias* e (nas Fases 1 e 2) pesos manuais, com dicas contextuais *"O que isso faz?"*.
3. **Treinar (TensorFlow.js em Web Worker)**: acompanhar a curva de *loss* ou recompensa ao vivo sem travar a interface (60 fps), podendo pausar, retomar ou reiniciar.
4. **Testar (Arena 2D)**: executar o robô a 30 ticks/s nas velocidades $0{,}5\times$, $1\times$ ou $4\times$, com **Replay do Episódio**.

### Critério de Pontuação (1 a 3 Estrelas)
- ⭐ **1 Estrela**: desafio da arena superado pelo robô.
- ⭐⭐ **2 Estrelas**: desafio superado com *loss* final abaixo da meta da fase.
- ⭐⭐⭐ **3 Estrelas**: desafio superado com *loss* abaixo da meta e usando no máximo o **número ideal de neurônios ocultos** (incentivando redes enxutas).

### Tabela de Fases (MVP)

| Fase | Desafio na Arena 2D | Conceito Ensinado | Rede Ideal | Paradigma |
| :--- | :--- | :--- | :---: | :--- |
| **1. Primeiro passo** | Pular caixas quando estiverem perto | Neurônio único, peso e limiar (*Perceptron*) | `1 → 1` | Supervisionado |
| **2. Porta lógica** | Abrir a porta com botões acesos no chão (`AND` / `OR`) | *Bias* e separação linear | `2 → 1` | Supervisionado |
| **3. Corredor** | Seguir um corredor sinuoso sem bater nas paredes | Camada oculta e ativação não linear | `3 → 4 → 3` | Supervisionado |
| **4. O XOR** | Abrir porta que exige exatamente um botão aceso | Limite linear de 1 neurônio e *Backpropagation* | `2 → 2 → 1` | Supervisionado |
| **5. Labirinto** | Chegar ao alvo num labirinto curto desviando de blocos | Aprendizado por reforço (recompensa vs. penalidade) | `4 → 6 → 3` | Reforço |

---

## 🏗️ Arquitetura Técnica e Stack

| Camada | Tecnologia | Motivo / Implementação |
| :--- | :--- | :--- |
| **Build e UI** | Vite + React 18 + TypeScript (`strict: true`) | Build rápido, tipagem estrita e *code-splitting* (`< 400 KB` gzip inicial) |
| **Estado** | Zustand (`src/store/useGameStore.ts`) | Gerenciamento reativo sem *boilerplate* e integrado ao Firestore |
| **Editor de Rede** | React Flow + Canvas SVG Acessível (`src/features/editor/`) | Manipulação por mouse e teclado (`Enter`/`Espaço`/`Delete`) e inspeção de $z$ e $a$ (RF-06) |
| **Núcleo & Treino** | `nn-core` Puro TS + TensorFlow.js em Web Worker | *Forward pass* determinístico compartilhado entre treino e arena (`src/workers/train.worker.ts`) |
| **Arena 2D** | Pixi.js + Simulação Determinística (`src/core/simulation/`) | Física 2D a 30 ticks/s com *seed* fixa (`42`), desacoplada da renderização |
| **Gráficos** | Recharts (`src/features/params/`) | Curva de *loss* e recompensa atualizada ao vivo |
| **Backend & Nuvem** | Firebase Hosting, Auth, Firestore e Analytics | Login anônimo + vínculo com conta Google preservando UID e até 10 redes salvas por fase |
| **Testes** | Vitest, Testing Library e Playwright | Cobertura $> 94\%$ em `src/core/*` + Teste E2E automatizado da Fase 1 |

---

## 📂 Estrutura de Pastas

```text
unb_mestradoFPO/
├── src/
│   ├── core/
│   │   ├── nn-core/          # Topologia, forward pass puro TS e adaptador TensorFlow.js
│   │   ├── simulation/       # Robô, sensores, física 2D determinística (seed 42) e replay
│   │   └── scoring/          # Cálculo de 1 a 3 estrelas
│   ├── workers/
│   │   └── train.worker.ts   # Treino TensorFlow.js assíncrono em Web Worker
│   ├── features/
│   │   ├── editor/           # Editor visual de neurônios e inspeção em tempo real (RF-06)
│   │   ├── params/           # Painel de hiperparâmetros, dicas (RF-04) e gráfico Recharts
│   │   ├── arena/            # Arena 2D Pixi.js, telemetria e replay (RF-07)
│   │   └── levels/           # Seleção das 5 fases, tutorial guiado, glossário e quiz (RF-10)
│   ├── levels/               # Definição estática das 5 fases (01-first-step.json a 05-maze.json)
│   ├── services/
│   │   └── firebase.ts       # Auth, Firestore, emulador de regras e eventos Analytics
│   ├── store/
│   │   └── useGameStore.ts   # Estado global Zustand + persistência em nuvem
│   ├── i18n/                 # Dicionários completos pt-BR.json e en.json (RNF-07)
│   └── __tests__/            # 9 suítes de testes unitários e de integração (Vitest)
├── e2e/
│   └── level1.spec.ts        # Teste End-to-End (Playwright) da Fase 1 completa
├── public/
│   ├── manifest.webmanifest  # Manifesto PWA offline (RNF-06)
│   └── sw.js                 # Service Worker para cache e execução offline
├── firebase.json             # Configuração do Firebase Hosting (SPA + headers de cache)
├── firestore.rules           # Regras de segurança por usuário (users/{uid}/**)
├── .firebaserc               # Projetos neurobot-dev e neurobot-prod
├── .github/workflows/
│   └── deploy.yml            # Pipeline CI/CD GitHub Actions + Firebase Hosting
└── docs/
    └── SDD.md                # Documento de Especificação de Software (SDD)
```

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos
- **Node.js** `>= 20` (recomendado `v22 LTS`)
- **npm** `>= 10`

### 2. Instalação e Configuração das Variáveis de Ambiente

Clone o repositório, instale as dependências e crie o arquivo `.env.local` a partir de `.env.example`:

**No Windows (PowerShell):**
```powershell
npm install
Copy-Item .env.example .env.local
```

**No Linux / macOS (Bash):**
```bash
npm install
cp .env.example .env.local
```

> **Nota sobre Execução Offline / Emulador**: Por padrão (`VITE_USE_FIREBASE_EMULATOR=true`), a aplicação utiliza o emulador local integrado de Auth e Firestore (validando em tempo real as regras de `firestore.rules`), funcionando 100% localmente sem exigir chaves externas.

### 3. Iniciar o Servidor de Desenvolvimento

```bash
npm run dev
```

Abra o navegador em `http://localhost:5173`.

---

## 🧪 Como Executar os Testes, Cobertura e Lint

```bash
# 1. Verificar padronização de código e tipagem (ESLint com 0 warnings)
npm run lint

# 2. Executar todas as 9 suítes de testes unitários e de integração (Vitest)
npm test

# 3. Executar testes com relatório de cobertura de código (94,35% em src/core/*)
npm run test:coverage

# 4. Executar o teste End-to-End (Playwright) completando a Fase 1 no navegador
npm run test:e2e
```

---

## 📦 Build de Produção e Deploy no Firebase Hosting

```bash
# Gerar pacote otimizado de produção na pasta dist/
npm run build

# Servir localmente o pacote de produção gerado
npm run preview
```

### Deploy Manual via Firebase CLI

```bash
# Ambiente de Desenvolvimento (neurobot-dev)
npx firebase-tools use dev
npx firebase-tools deploy --only hosting,firestore:rules

# Ambiente de Produção (neurobot-prod)
npx firebase-tools use prod
npx firebase-tools deploy --only hosting,firestore:rules
```

### CI/CD Automatizado (GitHub Actions)
O workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) executa `npm ci`, `npm run lint`, `npm run test:coverage` e `npm run build` a cada *Push* ou *Pull Request*:
- **Pull Requests**: gera automaticamente um canal de *Preview* no projeto `neurobot-dev` (`FIREBASE_SERVICE_ACCOUNT_NEUROBOT_DEV`).
- **Push na `main`**: publica automaticamente no canal de produção (`live`) do projeto `neurobot-prod` (`FIREBASE_SERVICE_ACCOUNT_NEUROBOT_PROD`).
