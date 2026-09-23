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
- comissão Ramo Nessa de 10% sobre a tarifa-base;
- compensação de coleta distante é integral do motorista e isenta de comissão;
- política de pagamento digital (Pix/cartão/carteira; dinheiro desligado);
- máquina de estados de pagamento;
- máquina de estados da corrida com bloqueio de matching antes do pagamento;
- validação runtime do contrato de cotação;
- endpoint inicial `POST /v1/pricing/quote`;
- endpoint de desenvolvimento `POST /v1/rides` protegido por identidade dev;
- criação de corrida somente com cotação exata;
- snapshot de preço/comissão por corrida;
- migration PostgreSQL inicial;
- adapter PostgreSQL real para corridas;
- runner de migrations;
- pagamentos persistentes com idempotência;
- endpoint GET de corrida do passageiro em desenvolvimento;
- endpoint POST de registro de pagamento em desenvolvimento;
- simulador financeiro explicitamente bloqueado em produção;
- ledger financeiro de dupla entrada;
- pagamento capturado entra em escrow da corrida;
- liquidação idempotente da corrida concluída;
- 10% creditado em receita da plataforma;
- 90% creditado no saldo contábil do motorista;
- solicitação de saque idempotente;
- reserva atômica do saldo para impedir saque duplicado;
- saldo reservado separado em payout_pending;
- Carteira Ramo Nessa baseada no ledger;
- crédito de carteira idempotente após recarga confirmada;
- pagamento de corrida com carteira e proteção contra saldo negativo;
- Carteira Ramo Nessa do passageiro no ledger;
- recarga só creditada após captura confirmada;
- pagamento de corrida pela carteira com débito atômico;
- proteção contra saldo negativo e pagamentos duplicados;
- pagamento confirmado atualiza a corrida para PAID;
- matching permanece bloqueado até a corrida estar financeiramente pronta;
- projeção persistente de motoristas online;
- filtro por categoria, capacidade e localização recente;
- exigência de 4x4 nas rotas aplicáveis de Jericoacoara;
- ranking por proximidade aproximada;
- despacho do domínio só inicia com corrida PAID;
- ofertas de corrida persistentes com expiração;
- apenas uma oferta ativa por vez por corrida;
- aceite atômico vincula motorista e muda corrida para DRIVER_ASSIGNED;
- motorista aceitando fica marcado como ocupado;
- recusa e expiração liberam retentativa para o próximo elegível;
- motorista já tentado não é repetido na mesma rodada;
- ausência de candidatos encerra busca em NO_DRIVER_FOUND;
- endpoints dev de saldo/recarga da Carteira;
- fallback em memória somente fora de produção;
- endpoint `GET /v1/payments/policy`;
- endpoint `GET /health`;
- driver-supply como fonte única de disponibilidade do motorista;
- filtro por categoria e capacidade real do veículo;
- filtro 4x4 para corredores de Jeri;
- ranking de candidatos por proximidade;
- localização vencida excluída do matching;
- distância reta usada só para ranking, nunca para preço;
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
- autenticação/autorização integrada ao endpoint de corrida;
- resolver coordenadas -> localidade;
- entrega realtime das ofertas de matching;
- localização em tempo real;
- máquina de estados;
- integração real com gateway Pix/cartão;
- interface da carteira no Passageiro;
- repasses;
- notificações;
- chat;
- auditoria e observabilidade.

A autoridade de preço deve permanecer no Core. O Flutter nunca deve decidir sozinho preço final, comissão ou elegibilidade de veículo.
