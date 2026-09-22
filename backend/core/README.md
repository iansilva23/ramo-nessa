# Ramo Nessa Core

Backend central e autoridade das regras críticas do ecossistema.

## Stack inicial

O Core passa a usar **Node.js + TypeScript**. A primeira camada implementada é o domínio de preço/comissão/política de pagamento sem acoplamento a banco ou gateway.

## Implementado

- catálogo comercial v1;
- preços fixos por corredor/localidade;
- Moto, Entrega, Carro, Comfort/Black e Buggy;
- regras após 22h já aprovadas;
- Comfort/Black + R$ 50 sobre Carro no Preá quando permitido;
- bloqueio comercial de Carro comum nas rotas 4x4 de Jeri;
- compensação de combustível para coleta distante;
- comissão Ramo Nessa de 10%;
- política de pagamento digital (Pix/cartão/carteira; dinheiro desligado);
- máquina de estados de pagamento;
- máquina de estados da corrida com bloqueio de matching antes do pagamento;
- validação runtime do contrato de cotação;
- endpoint inicial `POST /v1/pricing/quote`;
- endpoint `GET /v1/payments/policy`;
- endpoint `GET /health`;
- testes do domínio.

## Rodar localmente

```bash
cd backend/core
npm install
npm run typecheck
npm test
npm start
```

## Ainda pendente

- autenticação/autorização;
- persistência/Postgres;
- resolver coordenadas -> localidade;
- matching;
- localização em tempo real;
- máquina de estados;
- integração real com gateway Pix/cartão;
- ledger/carteira persistente;
- repasses;
- notificações;
- chat;
- auditoria e observabilidade.

A autoridade de preço deve permanecer no Core. O Flutter nunca deve decidir sozinho preço final, comissão ou elegibilidade de veículo.
