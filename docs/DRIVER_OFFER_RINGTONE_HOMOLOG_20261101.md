# Homologação — Toque de nova corrida (Motorista)
Data: 2026-11-01

## Identificação
- Pull request: https://github.com/iansilva23/ramo-nessa/pull/91
- Branch: `feature/driver-new-ride-ringtone-20261101`
- Áudio aprovado: ciclo de 2,09 s extraído do MP3 enviado; está em `apps/driver/assets/audio/nova_corrida.mp3`.
- Estado: sem merge, sem deploy e sem alteração em produção.

## Etapa 1 — testes de código (CI)
- `flutter pub get --enforce-lockfile`
- `flutter analyze`
- `flutter test`, incluindo `offer_tone_lifecycle_test.dart`
- Compilação Flutter Web, Android debug e iOS simulador.
- A execução anterior `41282494165` concluiu com sucesso nas três plataformas antes da inclusão dos testes específicos.
- Nova execução: `41283997575`. Consultar seu resultado antes de declarar a rodada encerrada.

## Etapa 2 — homologação em ambiente isolado e aparelhos reais
Pré-condições: comparar o código com a versão efetivamente instalada, preparar instalação separada / ambiente de teste, usar motorista e passageiro de teste e **não criar pagamentos reais**. Validar navegador e configurações de áudio do dispositivo.

| Caso | Ação | Resultado esperado |
|---|---|---|
| H01 | Motorista online recebe uma oferta válida | Toque começa assim que a oferta aparece |
| H02 | Manter a oferta aberta por vários ciclos | Mesmo toque se repete sem sobreposição ou reinícios inesperados |
| H03 | Motorista aceita | Toque interrompido; corrida continua normalmente |
| H04 | Motorista recusa | Toque interrompido; oferta desaparece |
| H05 | Motorista não responde e oferta expira | Toque interrompido no encerramento do prazo |
| H06 | Servidor retira/cancela oferta | Toque interrompido ao chegar atualização |
| H07 | Motorista fica offline com oferta | Toque interrompido |
| H08 | Oferta A encerra e depois chega oferta B | Sem áudio residual; novo toque inicia apenas para B |
| H09 | Aceite/recusa falha, mantendo oferta válida | O toque pode ser retomado; erro não trava o app |
| H10 | Fechar a tela durante o toque | Player é encerrado; não vaza áudio |
| H11 | Recarregar/reabrir app com oferta ainda válida | Oferta e toque seguem a política de recuperação do app sem duplicar |
| H12 | Web/PWA em iOS, Android e desktop | Registrar bloqueios de autoplay, permissões, silêncio e comportamento em segundo plano |

**Atenção:** build de CI com `RAMO_CORE_BASE_URL=https://example.invalid` comprova compilação, mas **não serve para corrida real ponta a ponta**. Teste E2E requer backend de homologação autorizado e configurado. O comportamento com app fechado/background depende de permissões e políticas do sistema; não está comprovado pela CI.

## Critérios para autorizar publicação
1. CI verde na revisão final.
2. H01 a H10 validados no ambiente de teste, H11/H12 verificados com limitações registradas.
3. Nenhuma regressão nas etapas de corrida, pagamentos, mapa e notificações.
4. Paridade conferida entre código de origem e versão publicada; processo de rollback preparado.
5. Aprovação explícita da versão para deploy, com aplicação segura sem perda de dados.

## Resultado
Homologação física/E2E: **pendente**. Não alegar conclusão funcional até executar os cenários reais. Não publicar automaticamente.
