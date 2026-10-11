# Cadastro do motorista pelo app

O Motorista oferece **Cadastrar como motorista** antes do login. O novo telefone é validado pelo WhatsApp na rota `POST /v1/auth/driver-registration/request`, usando os mesmos limites de envio, validade, tentativas e proteção contra replay do OTP existente. O telefone suspenso não é reativado por essa rota.

A sessão emitida para o candidato permite somente cadastro e consulta/envio de documentos, além dos recursos gerais da conta (sessão, privacidade e registro de push). O cadastro começa com `driver_registration_only=true`; autenticação para recursos operacionais e WebSocket rejeita essa conta. A proteção está no servidor, independentemente da tela do aplicativo.

Após verificar o telefone, o motorista preenche nome completo, categoria desejada e veículo. `POST /v1/driver/me/registration` persiste perfil e veículo **pendentes** em uma transação. Reenvios são idempotentes e não alteram dados ou decisões já registradas pelo ADM. Placa duplicada desfaz a operação inteira. O endpoint deriva o motorista da sessão; IDs e status enviados pelo cliente não concedem aprovação.

CNH e CRLV usam o armazenamento privado e os controles de revisão existentes. O motorista pode consultar os documentos e reenviar documentos recusados. A tela de acompanhamento informa pendências, análise e motivos de correção.

## Revisão no ADM

1. Abra **Motoristas** e selecione o cadastro marcado **Aguardando aprovação**.
2. Confira dados e veículo. Aprove perfil e veículo nos controles existentes.
3. Confira e aprove CNH e CRLV; documentos vencidos não autorizam a liberação.
4. Use **Liberar motorista**. Essa ação requer as permissões existentes de autenticação e registra a decisão na auditoria.
5. No app, **Atualizar situação** abre o mapa após a liberação. Reabrir o app também consulta a situação da conta.

Aprovar apenas o perfil ou o veículo não libera corridas e não suspende automaticamente o acesso do candidato à tela de cadastro. Uma suspensão explícita continua bloqueando a conta e revogando sessões. Motoristas anteriormente provisionados mantêm o fluxo existente.

## Atualização de homologação

O novo app exige a API que contém a migração `077_driver_self_registration.sql` e as novas rotas. Atualize o VPS com backup, fast-forward e `sudo node deploy/staging/start.mjs` antes de testar o APK. As credenciais privadas de WhatsApp, Firebase e Google Maps existentes são preservadas.

## Verificações

- Backend: OTP de cadastro, conta suspensa, bloqueio de recursos operacionais, aprovação obrigatória, replay e acesso entre tipos de conta.
- PostgreSQL: provisionamento concorrente, persistência, idempotência e rollback em conflito de placa.
- Flutter: botão de cadastro, rota OTP específica, intervalo de reenvio, espera de aprovação, atualização e falha de rede sem liberar o mapa.
- Homologação no dispositivo: cadastrar novo número, receber WhatsApp, enviar dados/CNH/CRLV, revisar no ADM, liberar e atualizar a situação.
