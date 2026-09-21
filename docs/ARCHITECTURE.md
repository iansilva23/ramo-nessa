# Arquitetura inicial — Ramo Nessa

## Produtos

O ecossistema será dividido em quatro superfícies principais:

1. **Ramo Nessa Passageiro** — Flutter para Android/iOS.
2. **Ramo Nessa Motorista** — Flutter para Android/iOS.
3. **Ramo Nessa Admin** — painel web administrativo.
4. **Ramo Nessa Core** — backend seguro responsável pelas regras críticas.

## Domínios principais

- autenticação e perfis
- motoristas, veículos e documentos
- disponibilidade online/offline
- geolocalização e motoristas próximos
- solicitação, oferta e aceite de corrida
- máquina de estados da viagem
- preço, taxas e comissão
- pagamento
- notificações
- chat passageiro ↔ motorista
- histórico e avaliações
- Carro
- Moto
- Entrega
- administração e auditoria

## Fluxo mínimo da corrida

```text
CREATED
  ↓
SEARCHING_DRIVER
  ↓
DRIVER_ASSIGNED
  ↓
DRIVER_ARRIVING
  ↓
DRIVER_ARRIVED
  ↓
IN_PROGRESS
  ↓
COMPLETED
```

Estados de exceção:

- CANCELLED_BY_PASSENGER
- CANCELLED_BY_DRIVER
- CANCELLED_BY_ADMIN
- NO_DRIVER_FOUND

A autoridade sobre transições críticas deve ficar no backend. O aplicativo não poderá decidir sozinho preço final, motorista vencedor, pagamento ou conclusão de corrida.

## Tempo real

O sistema deverá suportar:

- atualização contínua da localização do motorista
- WebSocket ou canal equivalente para eventos da corrida
- reconexão automática
- recuperação do estado atual após fechamento/reabertura do app
- interpolação visual entre coordenadas para evitar o veículo “pulando” no mapa
- fallback quando a conexão estiver ruim

## Dados

A arquitetura final do backend será fechada depois da auditoria técnica das bases open-source selecionadas. A camada de persistência deve oferecer:

- dados transacionais consistentes
- consultas geográficas
- histórico de viagens
- cache rápido para posições de motoristas
- trilha de auditoria para ações administrativas

## Segurança

Nunca colocar no Flutter:

- segredo de gateway de pagamento
- service-account Firebase
- chaves privadas
- regras críticas de comissão/preço
- autorização administrativa baseada apenas em interface

Credenciais devem permanecer no backend/secret manager.

## Estrutura do monorepo

```text
ramo-nessa/
├── apps/
│   ├── passenger/
│   ├── driver/
│   └── admin/
├── backend/
│   └── core/
├── packages/
│   ├── design_system/
│   └── shared/
└── docs/
```

Essa estrutura poderá ser refinada quando os projetos Flutter reais forem inicializados.
