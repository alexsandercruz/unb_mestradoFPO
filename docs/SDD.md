# Software Design Document (SDD) — NeuroBot

## 1. Visão geral e objetivos de aprendizagem
NeuroBot é um jogo web em que o jogador monta uma pequena rede neural, ajusta seus parâmetros e a treina para que um robô supere desafios numa arena 2D. O jogo roda inteiro no navegador e é publicado no Firebase Hosting. Este SDD é a especificação que o agente do Google Antigravity deve seguir para gerar o código.

**Público-alvo:** estudantes do ensino médio e graduação (14+ anos) e iniciantes em ML. Interface em português (`pt-BR`), com i18n preparado para inglês (`en`).

**Objetivos de aprendizagem** — ao terminar o jogo, o jogador consegue:
1. Explicar o que é um neurônio artificial: entradas, pesos, bias, soma ponderada e função de ativação.
2. Montar uma rede com camada de entrada, camadas ocultas e saída, e entender o papel de cada uma.
3. Ajustar hiperparâmetros (taxa de aprendizado, épocas, ativação) e observar o efeito no treino.
4. Ler uma curva de perda (loss) e reconhecer underfitting e overfitting.
5. Diferenciar aprendizado supervisionado (imitar exemplos) de aprendizado por reforço (recompensa) em fases mais avançadas.

**Princípio de design:** cada conceito aparece primeiro como mecânica de jogo e só depois ganha o nome técnico ("aprenda fazendo, nomeie depois").

## 2. Escopo do protótipo (MVP)
O MVP entrega 5 fases jogáveis, editor visual de neurônios, treino em tempo real no navegador e progresso salvo na nuvem.

**Dentro do escopo:**
- Login anônimo e com Google (Firebase Auth); progresso salvo por usuário.
- Editor drag-and-drop de rede: até 4 entradas (sensores), até 2 camadas ocultas com até 6 neurônios cada, até 3 saídas (ações).
- Painel de parâmetros: taxa de aprendizado, épocas, função de ativação, inicialização de pesos.
- Treino no cliente com TensorFlow.js e gráfico de loss ao vivo.
- Simulação do robô em canvas 2D, com replay do episódio.
- 5 fases com tutorial embutido e pontuação de 1 a 3 estrelas.
- Deploy no Firebase Hosting com CI via GitHub Actions.

**Fora do escopo (versões futuras):**
- Multiplayer, ranking global e modo professor/turma.
- Redes convolucionais, recorrentes ou visão computacional.
- Treino no servidor (Cloud Functions com GPU).
- Aplicativo mobile nativo (o MVP é web responsivo).

## 3. Mecânicas do jogo
Cada fase segue o mesmo ciclo de 4 passos: montar a rede, ajustar parâmetros, treinar e testar o robô na arena.
1. **Montar (Editor de Neurônios):** o jogador arrasta sensores (entradas), neurônios ocultos e ações (saídas) para o canvas e liga-os com cabos. Cada cabo é um peso; espessura = magnitude, cor = sinal (azul positivo, laranja negativo).
2. **Ajustar (Painel de Parâmetros):** sliders e seletores para taxa de aprendizado (0,001–1,0), épocas (1–500), ativação (degrau, sigmoide, ReLU, tanh) e bias ligado/desligado. Nas fases 1 e 2 o jogador também ajusta pesos manualmente.
3. **Treinar:** botão "Treinar" roda o TensorFlow.js num Web Worker; a curva de loss e a animação dos pesos atualizam ao vivo. O jogador pode pausar e voltar a ajustar.
4. **Testar (Arena):** o robô executa a rede treinada. Sensores leem o ambiente a cada tick, a rede decide a ação. Resultado: sucesso, falha ou tempo esgotado, com replay.

**Pontuação (estrelas):** 1 estrela = desafio superado; 2 = com loss abaixo da meta da fase; 3 = usando no máximo o número ideal de neurônios (incentiva redes enxutas).

### Robô e sensores

| Sensor (entrada) | Valor normalizado | Usado a partir da fase |
| --- | --- | --- |
| Distância à frente (`dist_front`) | 0–1 | 1 |
| Cor do chão / luz (`floor_light`) | 0 ou 1 | 2 |
| Distância à esquerda / direita (`dist_left`, `dist_right`) | 0–1 | 3 |
| Ângulo até o alvo (`target_angle`) | −1 a 1 | 4 |

| Ação (saída) | Efeito |
| --- | --- |
| Pular (`jump`) | Salta um obstáculo baixo |
| Virar esquerda / direita (`turn_left`, `turn_right`) | Gira 15° por tick |
| Andar (`walk`) | Avança 1 unidade |

### Fases do MVP

| Fase | Desafio | Conceito ensinado | Rede ideal |
| --- | --- | --- | --- |
| 1. Primeiro passo | Pular caixas quando estiverem perto | Neurônio único, peso, limiar (perceptron) | 1 entrada → 1 saída |
| 2. Porta lógica | Abrir a porta só com 2 botões acesos (AND), depois um ou outro (OR) | Bias e separação linear | 2 → 1 |
| 3. Corredor | Seguir um corredor sem bater nas paredes | Camada oculta, ativação não linear | 3 → 4 → 3 |
| 4. O XOR | Porta que abre com exatamente um botão | Por que um neurônio só não basta; treino por backpropagation | 2 → 2 → 1 |
| 5. Labirinto | Chegar ao alvo num labirinto curto | Aprendizado por reforço simples (recompensa por chegar, penalidade por bater) | 4 → 6 → 3 |

Nas fases 1–4 o treino é supervisionado: o jogo gera o dataset de exemplos (situação → ação correta), visível numa tabela. Na fase 5 o treino é por neuroevolução ou REINFORCE simplificado, com recompensa mostrada em gráfico.

## 4. Arquitetura técnica e stack
O NeuroBot é uma SPA estática: treino e simulação rodam no navegador, e o Firebase só hospeda o site, autentica e guarda o progresso. Isso mantém o custo perto de zero e o jogo funciona offline.

A interface lê e grava o estado; o treino roda num Web Worker para não travar a tela, e tanto o treino quanto a arena usam o mesmo `nn-core`.

| Camada | Tecnologia | Motivo |
| --- | --- | --- |
| Build e UI | Vite + React 18 + TypeScript | Build rápido, tipagem forte, ecossistema grande |
| Estado | Zustand | Simples, sem boilerplate, fácil de testar |
| Editor de rede | React Flow (ou SVG próprio) | Nós e cabos arrastáveis prontos |
| Treino | TensorFlow.js em Web Worker | ML no navegador, sem servidor |
| Arena 2D | Pixi.js | Renderização WebGL leve, 60 fps |
| Gráficos | Recharts | Curva de loss e recompensa |
| Backend | Firebase Hosting, Auth, Firestore, Analytics | Deploy em um comando, plano gratuito |
| Testes | Vitest, Testing Library, Playwright | Unidade, componentes e E2E |
| CI/CD | GitHub Actions + FirebaseExtended/action-hosting-deploy | Preview por PR e deploy automático |

### Estrutura de pastas
```text
neurobot/
├── src/
│   ├── core/
│   │   ├── nn-core/        # topologia, forward pass, conversão TF.js
│   │   ├── simulation/     # robô, sensores, física simples, seed
│   │   └── scoring/        # cálculo de estrelas
│   ├── workers/train.worker.ts
│   ├── features/
│   │   ├── editor/         # editor de neurônios
│   │   ├── params/         # painel de parâmetros
│   │   ├── arena/          # renderização Pixi + replay
│   │   └── levels/         # seleção de fases, tutorial
│   ├── levels/*.json       # definição das 5 fases
│   ├── services/firebase.ts
│   ├── store/              # Zustand
│   └── i18n/pt-BR.json, en.json
├── firebase.json  firestore.rules  .firebaserc
├── .github/workflows/deploy.yml
└── docs/SDD.md
```

Formato de uma fase (`levels/04-xor.json`): `id`, título, conceito, sensores liberados, ações liberadas, limite de neurônios, rede ideal, dataset ou função de recompensa, mapa da arena, meta de loss e textos do tutorial.

## 5. Modelo de dados e Firebase
O Firestore guarda só perfil, progresso e redes salvas; fases e textos ficam em JSON estático no bundle, sem custo de leitura.

### Coleções do Firestore

| Caminho | Campos principais | Quem escreve |
| --- | --- | --- |
| `users/{uid}` | `displayName`, `createdAt`, `lastLevel`, `totalStars`, `locale` | Próprio usuário |
| `users/{uid}/progress/{levelId}` | `stars` (0–3), `bestLoss`, `neuronsUsed`, `attempts`, `completedAt` | Próprio usuário |
| `users/{uid}/networks/{networkId}` | `levelId`, `name`, `topology` (JSON), `weights` (array), `params`, `savedAt` | Próprio usuário |

Exemplo de `topology`:
```json
{
  "inputs": ["dist_front", "floor_light"],
  "hidden": [[{"id": "h1", "activation": "relu"}, {"id": "h2", "activation": "relu"}]],
  "outputs": ["jump"],
  "links": [["dist_front", "h1"], ["floor_light", "h2"], ["h1", "jump"], ["h2", "jump"]]
}
```

Regras de segurança (`firestore.rules`):
```text
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Configuração do Hosting (`firebase.json`): pasta `dist`, rewrite de `**` para `/index.html` (SPA), cache longo (`max-age=31536000, immutable`) para `/assets/**` e `no-cache` para `index.html`. Ambientes: projeto `neurobot-dev` (canal de preview por PR) e `neurobot-prod`.

Analytics: eventos `level_start`, `train_run` (épocas, loss final), `level_complete` (estrelas) e `hint_open`, para medir onde os alunos travam.

## 6. Requisitos

### Funcionais

| ID | Requisito |
| --- | --- |
| RF-01 | O jogador entra como anônimo ou com Google; ao vincular a conta Google, o progresso anônimo é preservado. |
| RF-02 | O editor permite adicionar, mover, ligar e remover neurônios por arrastar, clique e teclado. |
| RF-03 | Cada fase define quais sensores, ações e limites de neurônios estão liberados. |
| RF-04 | O painel de parâmetros valida faixas e mostra uma dica curta ("o que isso faz?") por parâmetro. |
| RF-05 | O treino mostra loss por época em gráfico e pode ser pausado, retomado e reiniciado. |
| RF-06 | Ao passar o mouse num neurônio, o jogo mostra a soma ponderada e a saída da ativação em tempo real. |
| RF-07 | A arena executa a rede a 30 ticks/s, com velocidade 0,5×, 1× e 4× e replay do último episódio. |
| RF-08 | Ao concluir a fase, o jogo calcula estrelas, salva no Firestore e libera a próxima fase. |
| RF-09 | O jogador salva até 10 redes por fase e as carrega depois. |
| RF-10 | Cada fase tem um tutorial guiado na primeira vez e um glossário acessível a qualquer momento. |

### Não funcionais

| ID | Requisito | Meta |
| --- | --- | --- |
| RNF-01 | Desempenho | 60 fps na arena; UI responsiva durante o treino (treino em Web Worker) |
| RNF-02 | Carregamento | Primeira carga < 3 s em 4G; bundle inicial < 400 KB gzip (TF.js carregado sob demanda) |
| RNF-03 | Compatibilidade | Chrome, Edge, Firefox e Safari recentes; desktop e tablet a partir de 768 px |
| RNF-04 | Acessibilidade | WCAG 2.1 AA: contraste, navegação por teclado, sinais de peso não só por cor |
| RNF-05 | Privacidade | Adequado à LGPD; sem coleta de dados pessoais além do perfil Google; aviso para menores |
| RNF-06 | Offline | Fases já carregadas jogáveis offline (PWA); sincroniza progresso ao reconectar |
| RNF-07 | Custo | Dentro do plano gratuito Spark para até ~1.000 jogadores ativos/mês |
| RNF-08 | Qualidade | Cobertura de testes ≥ 70% no núcleo (rede, simulação, pontuação) |

## 7. Plano de tarefas e critérios de aceite
O agente deve executar as tarefas em ordem, com um commit por tarefa e testes passando antes de avançar.
- [ ] T1 — Scaffold: projeto Vite + React + TypeScript, ESLint, Prettier, Vitest, estrutura de pastas da seção 4. Aceite: `npm run dev` abre a tela inicial; `npm test` passa.
- [ ] T2 — Firebase: inicializar Hosting, Auth e Firestore; `firebase.json`, `firestore.rules`, `.firebaserc` com dev e prod; emuladores locais. Aceite: login anônimo funciona no emulador; regras bloqueiam leitura de outro uid (teste de regras).
- [ ] T3 — Núcleo da rede: módulo `nn-core` com tipos de topologia, conversão para modelo TF.js e forward pass puro em TS para a visualização. Aceite: testes de unidade para AND, OR e XOR convergem com loss < 0,05.
- [ ] T4 — Editor de neurônios: canvas com React Flow (ou SVG próprio), drag-and-drop, cabos, limites por fase. Aceite: montar a rede 2→2→1 só com teclado e mouse; topologia exportada bate com o JSON esperado.
- [ ] T5 — Painel de parâmetros e treino: sliders, Web Worker de treino, gráfico de loss (Recharts). Aceite: UI mantém 60 fps durante 500 épocas; pausar/retomar preserva os pesos.
- [ ] T6 — Arena e robô: simulação determinística (seed fixa) em canvas 2D com Pixi.js ou Phaser, sensores, ações, replay. Aceite: mesma rede + mesma seed = mesmo resultado em 10 execuções.
- [ ] T7 — Fases 1–5: arquivos `levels/*.json`, tutorial guiado, pontuação em estrelas, desbloqueio. Aceite: cada fase é vencível com a rede ideal da tabela da seção 3.
- [ ] T8 — Persistência: salvar progresso e redes, vincular conta anônima ao Google. Aceite: progresso sobrevive a recarregar a página e trocar de dispositivo após login.
- [ ] T9 — Polimento: PWA, acessibilidade, i18n pt-BR/en, analytics. Aceite: Lighthouse ≥ 90 em Performance, Acessibilidade e Boas práticas.
- [ ] T10 — CI/CD e deploy: GitHub Actions com lint, testes e build; preview channel por PR; deploy em prod no merge para `main`. Aceite: URL pública `https://<projeto>.web.app` abre o jogo e completa a fase 1.

**Definição de pronto do MVP:** um jogador novo, sem conhecimento de ML, conclui as 5 fases em até 45 minutos num teste com 5 usuários, e acerta pelo menos 4 de 5 perguntas de um quiz final sobre os conceitos da seção 1.
