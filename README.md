# Ramo Nessa

> **Proprietary software — Copyright © 2026 Ian Silva. All rights reserved.**
> Public visibility does not make this project open source. See [LICENSE](LICENSE)
> and [NOTICE.md](NOTICE.md).

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
- regras noturnas revisadas, com Entrega sem adicional após 22h;
- compensação de combustível por coleta distante;
- comissão Ramo Nessa de 10%;
- política de lançamento 100% digital.

O Passageiro já possui cliente HTTP para pedir a cotação ao Core. O antigo preço comercial calculado somente no Flutter foi removido: sem Core configurado o app não inventa um valor.

## Ainda não é produção

A base funcional já inclui autenticação/sessões, PostgreSQL, matching, realtime, máquina de estados, ledger/carteira, repasses e catálogo comercial versionado com edição pelo ADM.

A passagem para produção ainda depende, entre outros pontos, de:

- infraestrutura hospedada e deploy operacional do Core/Admin;
- backup, restore testado, monitoramento e alertas;
- credenciais/homologação externa de Mercado Pago;
- provider OTP/SMS real;
- Firebase/Push/APNs de produção;
- storage privado persistente para documentos;
- chaves comerciais restritas e billing/quotas do Google Maps;
- testes em aparelhos físicos, carga/segurança, piloto controlado e preparação das lojas.

Os preços e regras comerciais ainda em revisão só devem ser atualizados depois de aprovação explícita da tabela oficial.

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

## Propriedade intelectual

Este projeto **não é open source**. Nenhuma licença de uso comercial, redistribuição,
white-label, derivação de código protegido ou uso da marca Ramo Nessa é concedida
pela disponibilização deste repositório.

Consulte:

- [LICENSE](LICENSE) — termos proprietários completos;
- [NOTICE.md](NOTICE.md) — aviso resumido de titularidade;
- [docs/IP_AND_BRAND_POLICY.md](docs/IP_AND_BRAND_POLICY.md) — política de propriedade intelectual e marca;
- [CONTRIBUTING.md](CONTRIBUTING.md) — regras para contribuições externas.
