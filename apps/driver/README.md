# Ramo Nessa Motorista

Aplicativo Flutter do motorista, separado do Passageiro.

## Estado atual
- Android Flutter buildável;
- identidade visual compartilhada Ramo Nessa;
- leitura do cadastro operacional aprovado;
- online/offline;
- atualização de localização em foreground;
- polling temporário de ofertas;
- oferta mostra ganho, rota, passageiros e coleta aproximada;
- aceitar/recusar integrado ao Core;
- aceite mostra ponto de embarque e deixa motorista ocupado.

## Segurança
O app não pode alterar categoria, 4x4, capacidade ou veículo. Esses dados
vêm do cadastro aprovado no Core.

## Desenvolvimento
Use:
- RAMO_CORE_BASE_URL
- RAMO_DEV_DRIVER_ID

A identidade de desenvolvimento é recusada pelo Core em produção.

## Ainda falta
- autenticação real;
- onboarding/documentos;
- realtime/push;
- GPS em background;
- navegação;
- estados Cheguei / Iniciar / Finalizar;
- ganhos, saque, histórico e avaliações;
- iOS e assinatura de release.
