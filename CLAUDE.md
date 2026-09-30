# CLAUDE.md — Pirate Battle (teste técnico Jungle Gaming)

## O que é isso

Um shooter naval 2D visto de cima, feito para um teste técnico de entrevista. Prazo: **2 dias a partir do e-mail** (recebido em 29/09/2026 às 15:43 BRT → entrega até 01/10/2026 às 15:43 BRT). O repositório entregue precisa incluir uma URL pública de deploy. Este arquivo existe para que qualquer sessão nova do Claude Code pegue o contexto completo rápido, sem precisar reler o desafio inteiro.

O enunciado original do desafio está em `CHALLENGE.md` neste repositório (copiado de https://github.com/junglegaming/game-developer-challenge). **Leia esse arquivo para os requisitos exatos antes de implementar qualquer funcionalidade** — este CLAUDE.md só resume e prioriza; o CHALLENGE.md é a fonte da verdade.

Os assets (navios, tiles, spritesheets de UI, sons) vêm da pasta `assets/` do repositório do desafio e já estão copiados para este repositório — não recrie nada disso.

## Restrições inegociáveis

- **Idioma**: todo texto de interface, identificadores de código, comentários e documentação da solução (README.md, ARCHITECTURE.md) devem estar em **inglês**. Isso é exigência do enunciado, não deste arquivo.
- **Stack é fixa**: React + TypeScript (modo estrito) para UI/menus, PixiJS para a renderização do jogo, TanStack Query + Axios para ranking/histórico, MSW para mockar essas duas APIs REST, Playwright para E2E + regressão visual. Não troque nenhuma dessas.
- **O resto é livre** (bundler, estilização, estratégia de estado dentro da simulação).
- O jogo é single-player e roda inteiramente no navegador. Só ranking e histórico de partidas tocam um "backend" (mockado via MSW).
- **Deploy é obrigatório** (Vercel de preferência). O build publicado precisa rodar os mocks do MSW de verdade — ou seja, modo service worker, não só `setupServer` para testes.

## Ordem de prioridade (pelo peso da nota — não reordenar sem motivo)

| Área                                                       | Pontos | Observação                                                                                                                            |
| ---------------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------- |
| Gameplay, regras, colisões, comportamento dos inimigos     |     35 | Maior bloco isolado. Deixar isso redondo antes de polir qualquer outra coisa.                                                         |
| Arquitetura PixiJS e ciclo de vida dos recursos            |     20 | Separação sim/render/input, simulação por delta-time, sem re-render do React a cada frame, limpeza correta inclusive com Strict Mode. |
| Interface, feedback, responsividade, acessibilidade        |     15 | Menus, HUD, options, controles de toque, navegação por teclado, contraste.                                                            |
| TanStack Query + Axios + consistência do ranking/histórico |     10 | Recuperação de registro pendente, sem duplicar envio, proteção contra resposta desatualizada.                                         |
| MSW e cenários de falha                                    |      5 | Cenários selecionáveis/reproduzíveis, precisam funcionar no build de produção.                                                        |
| Testes Playwright                                          |     10 | 12 fluxos obrigatórios (lista abaixo), Chromium desktop + mobile, baselines de regressão visual.                                      |
| Performance e documentação                                 |      5 | FPS/p95 do tempo entre frames/quantidade de entidades numa partida de 3 min, memória após 5 ciclos, ARCHITECTURE.md.                  |

**Se o tempo apertar, cortar de baixo para cima nessa tabela, nunca de cima para baixo.** Um combate impecável com pouca documentação vale mais do que um combate mediano com documentação perfeita.

## Ordem de construção sugerida (fases — ajustar conforme o andamento, manter esta lista atualizada)

1. **Scaffold**: Vite + React + TS estrito + PixiJS ligado a um componente de canvas. `gameConfig` central e tipado (duração, intervalo/distribuição de spawn, vida, velocidade de movimento/rotação, dano, alcance/velocidade/tempo de vida do projétil, cooldowns, alcance do Shooter). Nenhum valor de balanceamento fixo fora dessa config.
2. **Loop de simulação**: ticker por delta-time separado do render do React; limites da arena; pelo menos uma ilha como obstáculo estático; movimento e rotação do navio do jogador (teclado primeiro).
3. **Combate**: projétil frontal (1) + volley lateral (3, esquerda/direita); cooldown por arma; ciclo de vida do projétil (dano único, remoção ao atingir alvo/expirar/saída da arena/atingir obstáculo).
4. **Inimigos**: Chaser (persegue, dano por contato, autodestrói ao colidir, sem pontuar) e Shooter (se aproxima, dispara dentro do alcance) — ambos precisam de movimento, rotação, dano recebido, colisão com ilhas. Spawner: intervalos configurados, pontos de spawn validados como livres de obstáculo e afastados do jogador.
5. **Ciclo da partida**: vida, pontuação (1 pt por inimigo morto pelo jogador, autodestruição do Chaser não pontua), cronômetro (60–180s configurável), fim por morte ou tempo, reinício = entidades/vida/pontuação/cronômetro do zero. Pausa manual + automática ao perder foco/aba oculta, sem acumular input/movimento durante a pausa.
6. **HUD e feedback**: barra de vida sobre os navios, pontuação/tempo no HUD, efeitos de disparo/explosão, visual de dano no navio conforme % de vida (troca de textura/tint). Feedback perceptível de ataque/impacto/dano, e uma interface semântica/acessível para pontuação/tempo/estado (sem anúncio a cada frame).
7. **Controles de toque**: espelhando o teclado (mover/girar/disparo frontal/esquerda/direita), mover e disparar ao mesmo tempo.
8. **Telas**: Menu principal (Play/Options, aba Ranking, aba Match History, legenda de controles), Options (tempo de sessão + intervalo de spawn, validado, persistido no localStorage, aplicado como snapshot no início da partida), Resultado (pontuação, tempo jogado, motivo do fim, situação do registro, Play Again/Main Menu). Recarregar ou sair da tela de combate encerra a partida; partida abandonada não é registrada.
9. **Resize/DPR**: canvas se ajusta a tela e densidade de pixels, preservando proporção, coordenadas de input e limites da arena; progresso/estado de carregamento dos assets, com tratamento de falha antes do combate.
10. **Camada de dados de ranking/histórico**: contratos tipados, cliente Axios, handlers e fixtures do MSW compartilhados entre dev/teste/demo, hooks do TanStack Query (listagem paginada, envio de partida). Envio de partida idempotente (retry seguro, sem duplicar), persistência de registro pendente após refresh/falha, proteção contra resposta atrasada sobrescrevendo dado mais recente, critério de desempate no ranking para mesma config.
11. **Controles de cenário do MSW**: um seletor visível (sucesso/vazio/paginado/lento/latência variável/fora de ordem/timeout/4xx/5xx/timeout pós-envio com recuperação/histórico fora do ar no fim da partida) + botão de reset ao estado inicial. Precisa funcionar no build de produção (MSW worker, não só servidor node).
12. **Limpeza**: segurança com Strict Mode (double-invoke), liberação de ticker/listeners/texturas ao desmontar/reiniciar, checagem de vazamento de memória em 5 ciclos de jogo.
13. **Playwright**: os 12 fluxos abaixo, Chromium desktop + mobile, cenários com seed e relógio de simulação controlável, estado isolado por teste, baselines de regressão visual (menu, arena em estado estável, tela de resultado), relatório HTML + traces de falha.
14. **Docs e profiling**: README.md (setup, variáveis de ambiente, controles, configuração de gameplay, seleção/reset de cenários, comandos de dev/build/preview/lint/typecheck/teste, como reproduzir falhas), ARCHITECTURE.md (integração React/PixiJS, loop de simulação, colisões, gerenciamento de recursos, persistência local, integração de ranking/histórico incluindo contratos/cache/recuperação de pendentes, limitações e decisões de balanceamento), relatório de performance (hardware/navegador/resolução/config, FPS, p95 do tempo entre frames, quantidade de entidades, memória em 5 ciclos).
15. **Deploy** — fazer isso cedo (idealmente fim do dia 1) com um build inicial, e reimplantar conforme as features forem ficando prontas, para nunca ter correria no último momento.

## Cobertura obrigatória do Playwright (não entregar sem esses 12)

1. Navegação, validação e persistência das opções.
2. Carregamento dos assets, falha, nova tentativa.
3. Início de partida, movimento, rotação, limites da arena, colisão com ilha.
4. Disparo frontal e lateral, dano, cooldown, sem pontuação duplicada.
5. Comportamento de Chaser e Shooter + intervalo de spawn.
6. Fim por tempo e por morte; simulação para corretamente; reinício limpo.
7. Pausa, perda de foco, retomada sem avanço indevido do cronômetro/estado.
8. Exibição da tela de resultado + persistência após refresh.
9. Abandono de partida, navegação repetida entre telas, controles de toque.
10. Consulta e paginação de Ranking/Match History incluindo carregamento/vazio/erro.
11. Envio da partida, atualização das duas abas, recuperação de envio pendente após refresh.
12. Reenvio após timeout sem duplicar; respostas atrasadas não sobrescrevem dado mais recente.

## Regras de arquitetura para eu me autocobrar a cada fase

- O estado contínuo do combate vive na camada de simulação/Pixi, não no estado do React. O React lê isso por assinatura/seletor, não por re-render a cada tick.
- As regras do jogo (movimento, combate, colisões, comportamento dos inimigos) são implementadas por nós — sem biblioteca de lógica de jogo pronta.
- Todo valor de balanceamento vem da config tipada — mudar um número nunca deve exigir tocar na lógica dos sistemas.
- Toda entidade/projétil criado precisa ter um caminho de destruição correspondente.
- Falha nas APIs de ranking/histórico nunca pode bloquear o jogo, as opções ou interromper o combate.

## Comandos (preencher ao fazer o scaffold, manter atualizado)

```bash
npm run dev          # servidor de dev local
npm run build        # build de produção
npm run preview      # preview do build de produção
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # vitest (pure simulation unit tests)
npm run test:e2e     # playwright (not wired yet, phase 13)
npm run test:e2e:ui  # (not wired yet, phase 13)
```

## Status atual

_Atualizar esta seção no fim de cada sessão, para a próxima já saber onde parou._

- [x] Fase 1 — scaffold (Vite 8 + React 19 + TS 6 strict + Pixi 8; `gameConfig` in `src/game/gameConfig.ts`; `GameCanvas` is Strict Mode safe; typecheck + lint + build pass)
- [x] Fase 2 — loop de simulação (fixed-step `Simulation`, `Game` glue, `Renderer`, keyboard; vitest unit tests; verified in browser)
- [x] Fase 3 — combate (front + 3-shot broadsides, per-weapon cooldowns, projectile lifecycle, swept hit test; 17 unit tests)
- [x] Fase 4 — inimigos + spawner (Chaser, Shooter, island steering, validated spawn points, opening sequence; 29 unit tests)
- [x] Fase 5 — ciclo da partida (score, timer, end by time/death, freeze after end, pause manual+auto with explicit resume, restart, MatchStore; 38 unit tests + browser check)
- [x] Fase 6 — HUD + feedback (Pixi health bars, damage sprite stages, muzzle/impact/splash/explosion effects, camera shake, React HUD via MatchStore, pause overlay, sr-only live status; verified in browser)
- [x] Fase 7 — controles de toque (pointer-capture hold buttons: turn L/R, forward, 3 cannons; simultaneous multi-touch; shown on coarse pointer or ?touch=1; verified in browser at 812x375)
- [x] Fase 8 — telas (menu w/ Ranking+History tabs [placeholders until phase 10], options w/ validation+persistence, match screen w/ pause/restart/quit dialog, result dialog, last-match card; verified in browser)
- [x] Fase 9 — resize/DPR + UX de carregamento de assets (ResizeObserver+letterbox, DPR capped at 2 + live DPR watch, retina tiles/HUD art at DPR>=1.5, hand-rolled texture loader w/ progress bar, error+retry verified)
- [x] Fase 10 — camada de dados de ranking/histórico (typed contracts, Axios client, MSW handlers+MockDb+fixtures shared, TanStack hooks w/ revision-guard, idempotent submit + persisted pending queue + retry; 76 tests; verified in browser incl. timeout-after-commit and reload recovery)
- [x] Fase 11 — controles de cenário do MSW (visible select of 15 scenarios + instant-latency toggle + confirmed reset; verified in dev and in the production build via vite preview)
- [x] Fase 12 — limpeza/passagem com Strict Mode (disposal audit; texture sets cached per density; 10 Play→Menu cycles + 20 restarts checked in browser: 0 leftover canvases, no errors, heap flat; formal memory profile in phase 14)
- [x] Fase 13 — suíte Playwright (150 tests green: 75 x chromium-desktop + chromium-mobile; all 12 mandatory flows + visual regression baselines for menu, arena, arena+touch, pause, result, options; HTML report + traces on failure)
- [x] Fase 14 — docs + profiling (README, ARCHITECTURE, docs/PERFORMANCE.md: 60 FPS avg, p95 16.7 ms over a 3-min match on GTX 1650; heap plateaus over 25 cycles; licenses/)
- [ ] Fase 15 — deploy (fazer cedo, repetir sempre)

## Versão atual

**v1.0.0** (tag git `v1.0.0`, 29/09/2026) — todas as funcionalidades do desafio prontas e testadas, exceto o deploy. Detalhes em `CHANGELOG.md`. Para voltar a esse estado: `git checkout v1.0.0`.

## Melhorias de interface (pós-v1.0.0)

Uma de cada vez, cada uma com commit próprio e testes de regressão (lint + typecheck + unit + specs e2e afetados + regressão visual; suíte completa nos checkpoints). Antes de cada uma, conferir contra o `CHALLENGE.md`.

- [x] UI-1 — fogo nos navios danificados (sprites `fire_1`/`fire_2`, já carregados e sem uso). Enunciado: reforça "deterioração visual dos navios conforme a vida restante"; manter pequeno para não prejudicar a "leitura da arena".
- [x] UI-2 — legibilidade da vida: barras dos inimigos vermelhas, do jogador verdes (âmbar/vermelho quando baixa) e "76 / 100" no HUD. Enunciado: "Exiba vida acima do navio do jogador e de cada inimigo" continua atendido.
- [ ] UI-3 — moldura da arena: preencher as faixas escuras (letterbox) com mar escurecido + borda de limite clara, e HUD mais compacto em telas baixas. **Não** sobrepor o HUD à arena como na imagem de referência: o enunciado exige "sem cortes na arena ou no HUD".
- [ ] UI-4 — sons (assets/sounds) + botão de mudo persistido, pausando junto com o jogo e só iniciando após gesto do usuário. Enunciado: permitido ("recursos complementares"); console sem erros (autoplay).
- [ ] UI-5 — ranking: seletor de configuração (padrão = opções atuais). Enunciado: continua comparando só partidas com a mesma configuração.
- [ ] UI-6 — resultado: mostrar a posição no ranking depois que a partida for registrada. Enunciado: resultado continua com pontuação, tempo, motivo, situação do registro e as duas ações.
- [ ] UI-7 — feedback de rede nas listas: mostrar tentativas ("retrying 1/2") e timeout padrão menor. Enunciado: "Gerencie carregamento, vazio, erro, atualização em segundo plano… e retries".
- [ ] UI-8 — polimento: lembrete de controles no diálogo de pausa, favicon, rótulo acessível no canvas, aviso de "gire o aparelho" sem quebra. Enunciado: "Apresente os comandos na interface".

## Prazo

Entrega até **01/10/2026, 15:43 BRT**. Meta: terminar o núcleo (fases 1–9) até o fim do dia 1; ranking/histórico + testes (10–13) na manhã/tarde do dia 2; docs, profiling e checagem final de deploy (14–15) na noite do dia 2, deixando a manhã do dia da entrega livre só para checagem final — nada novo começado tão perto do prazo.
