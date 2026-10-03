# Ramo Nessa Motorista

Aplicativo Flutter do motorista, separado do Passageiro.

## Estado atual
- Android Flutter buildável;
- identidade visual compartilhada Ramo Nessa;
- leitura do cadastro operacional aprovado;
- online/offline;
- atualização manual de localização em foreground;
- tracking contínuo Android enquanto online via foreground service;
- notificação persistente de localização durante o tracking;
- polling temporário de ofertas;
- oferta mostra ganho, rota, passageiros e coleta aproximada;
- aceitar/recusar integrado ao Core;
- aceite mostra ponto de embarque e deixa motorista ocupado;
- corrida ativa é recuperada após reabrir o app;
- Cheguei / Iniciar / Finalizar integrados ao Core;
- finalização exibe saldo disponível do motorista;
- painel de ganhos mostra saldo disponível e saque em processamento;
- solicitação de saque integrada ao Core com reserva idempotente;
- embarque e destino exatos ficam disponíveis para o fluxo de navegação;
- botão abre navegação externa para embarque antes da corrida;
- após iniciar, botão abre navegação externa para o destino exato;
- navegação interna desenha e enquadra a rota até o passageiro e, após iniciar,
  troca para a rota até o destino;
- marcadores 3D de carro, moto, entrega e buggy giram conforme o rumo;
- Preview usa Google Routes via Core quando `RAMO_CORE_BASE_URL` HTTPS estiver
  configurada; sem ela, mantém uma rota demonstrativa offline;
- APK debug publicado como artefato do Driver CI.

## Segurança
O app não pode alterar categoria, 4x4, capacidade ou veículo. Esses dados
vêm do cadastro aprovado no Core.

## Desenvolvimento
Use:
- RAMO_CORE_BASE_URL
- RAMO_DEV_DRIVER_ID

A identidade de desenvolvimento é recusada pelo Core em produção.

## Estado de produção / pendências externas
Já existem login OTP/sessão Bearer, cadastro aprovado, documentos, realtime com fallback HTTP, infraestrutura de push, ganhos, saque, histórico, avaliações e ciclo completo da corrida no app/Core.

Antes de tratar o app como pronto para lançamento ainda é necessário:
- configurar provider OTP/SMS e credenciais de produção;
- configurar Firebase/FCM e APNs finais;
- conectar storage privado persistente para documentos e validar o onboarding operacional;
- validar tracking/background, navegação e notificações em aparelhos Android/iPhone reais;
- concluir assinatura Android de produção e signing/provisioning iOS;
- homologar os fluxos financeiros reais e executar piloto controlado;
- validar a experiência de navegação guiada final em uso de rua.

A identidade `RAMO_DEV_DRIVER_ID` continua sendo apenas fallback explícito de desenvolvimento e é recusada pelo Core em produção.
