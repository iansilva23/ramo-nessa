# Ramo Nessa

Plataforma de mobilidade local com apps Flutter para passageiro/motorista e um Core seguro responsável pelas regras críticas.

## Estrutura

- `apps/passenger` — aplicativo do passageiro
- `apps/driver` — aplicativo do motorista
- `apps/admin` — painel administrativo
- `backend/core` — API e regras de negócio em Node.js + TypeScript
- `packages/design_system` — componentes, tema, motion e identidade
- `packages/shared` — modelos e utilitários compartilhados
- `docs` — arquitetura, regras comerciais, decisões, auditoria e roadmap

## Estado atual

O Passageiro já possui base Flutter Android/iOS, Design System, GPS em primeiro plano, mapa, origem manual/GPS, busca explícita de destino, rota, distância e ETA em ambiente de desenvolvimento.

A regra comercial v1 já foi consolidada no Core:

- Moto, Entrega, Carro, Comfort/Black e Buggy;
- tabelas de Jeri, Jijoca e Preá;
- corredores 4x4 e Aeroporto JJD;
- regras noturnas aprovadas;
- compensação de combustível por coleta distante;
- comissão Ramo Nessa de 10%;
- política de lançamento 100% digital.

O Passageiro já possui cliente HTTP para pedir a cotação ao Core. O antigo preço comercial calculado somente no Flutter foi removido: sem Core configurado o app não inventa um valor.

## Ainda não é produção

Ainda faltam, entre outros pontos:

- autenticação e autorização;
- banco/persistência;
- matching real;
- localização em tempo real do Motorista;
- máquina de estados autoritativa da viagem;
- provedor real de Pix/cartão;
- ledger/carteira e repasses;
- Admin para editar preços;
- deploy de produção do Core;
- testes físicos e preparação de lojas.

Consulte `docs/RELEASE_BLOCKERS.md` antes de tratar qualquer build como pronto para distribuição.

## Fontes comerciais

- `docs/COMMERCIAL_RULES_V1.md`
- `docs/PAYMENTS_AND_COMMISSION_V1.md`
- `docs/PRICING_AND_ZONES.md`

## Princípios

- Flutter moderno para Android e iOS;
- UX premium e fluida;
- regras críticas e dinheiro sob autoridade do backend;
- preço final nunca decidido somente pelo cliente;
- componentes reutilizáveis e arquitetura modular;
- rastreamento em tempo real;
- operação preparada para Carro, Moto, Entrega, Comfort/Black e Buggy;
- localização e pagamentos adaptados ao Brasil.
