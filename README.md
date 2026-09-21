# Ramo Nessa

Plataforma de mobilidade local em Flutter, com foco inicial em **Carro, Moto e Entrega**.

## Estrutura

- `apps/passenger` — aplicativo do passageiro
- `apps/driver` — aplicativo do motorista
- `apps/admin` — painel administrativo
- `backend/core` — API e regras de negócio
- `packages/design_system` — componentes, tema, motion e identidade
- `packages/shared` — modelos e utilitários compartilhados
- `docs` — arquitetura, decisões, auditoria e roadmap

## Estado atual

O app Passageiro já possui base Flutter Android/iOS, Design System, GPS em primeiro plano, mapa, busca explícita de destino, rota, distância e ETA em ambiente de desenvolvimento.

O matching com motoristas, backend, autenticação, preço real, pagamentos e operação comercial **ainda não estão implementados**. Valores de preço existentes são provisórios.

Consulte `docs/RELEASE_BLOCKERS.md` antes de tratar um build como pronto para distribuição.

## Princípios

- Flutter moderno para Android e iOS
- UX premium e fluida
- segurança e regras críticas no backend
- componentes reutilizáveis e arquitetura modular
- rastreamento em tempo real
- suporte a Carro, Moto e Entrega
- localização e pagamentos adaptados ao Brasil
