# Arquitetura — Ramo Nessa

## Produtos

O ecossistema é dividido em quatro superfícies principais:

1. **Ramo Nessa Passageiro** — Flutter para Android/iOS.
2. **Ramo Nessa Motorista** — Flutter para Android atualmente; estrutura iOS ainda precisa ser criada e validada.
3. **Ramo Nessa Admin** — painel web administrativo.
4. **Ramo Nessa Core** — backend seguro responsável pelas regras críticas.

## Core

A stack inicial do Core foi definida como **Node.js + TypeScript**.

A primeira camada implementada é deliberadamente independente de banco/gateway e contém:

- catálogo comercial v1;
- cotação por rota/localidade/categoria;
- comissão;
- regras noturnas aprovadas;
- compensação por motorista distante;
- política de meios de pagamento;
- máquina de estados de pagamento;
- máquina de estados inicial da corrida;
- criação de corrida a partir de cotação exata;
- snapshot imutável de preço/comissão por corrida;
- schema PostgreSQL inicial para persistência;
- bloqueio de matching sem pagamento autorizado/pago.

Essa camada pura continua testável sem infraestrutura externa e já foi conectada a PostgreSQL, matching, ledger/carteira, WebSocket e autenticação por telefone/OTP com sessão Bearer. Ainda faltam provider SMS de produção, gateway Pix/cartão, repasses e deploy de produção.

### Autenticação

- telefone brasileiro normalizado em E.164;
- Passageiro pode criar identidade após verificar OTP;
- Motorista só autentica se a identidade já tiver sido provisionada/aprovada;
- OTP expira em 5 minutos, possui cooldown e limite de tentativas;
- somente HMAC do código é persistido;
- sessão usa token opaco aleatório; somente SHA-256 do Bearer é persistido;
- token mobile fica no Keychain/Keystore e não é embutido no build;
- logout revoga a sessão no Core antes de apagar o token local;
- sessão Bearer é recusada imediatamente se a identidade estiver suspensa;
- provider dev é proibido em produção; produção usa adapter de entrega HTTPS;
- Core falha ao iniciar em produção sem provider OTP/segredo válidos.

## Autoridade

O Core é a autoridade sobre:

- preço final;
- comissão;
- elegibilidade de categoria/veículo;
- pagamento;
- motorista vencedor;
- transições críticas da corrida;
- saldo/carteira;
- auditoria.

O Flutter pode apresentar uma cotação, mas não deve fabricar ou alterar preço comercial de forma autoritativa.

## Domínios principais

- autenticação e perfis;
- motoristas, veículos e documentos;
- disponibilidade online/offline;
- geolocalização e motoristas próximos;
- solicitação, oferta e aceite;
- máquina de estados da viagem;
- pricing, taxas e comissão;
- Pix/cartão/carteira;
- notificações;
- chat passageiro ↔ motorista;
- histórico e avaliações;
- Carro;
- Moto;
- Entrega;
- Comfort/Black;
- Buggy;
- administração e auditoria.

## Fluxo comercial alvo

```text
PASSAGEIRO DEFINE ORIGEM/DESTINO
  ↓
CORE RESOLVE ROTA COMERCIAL + CATEGORIAS ELEGÍVEIS
  ↓
CORE CALCULA COTAÇÃO
  ↓
PRÉ-BUSCA/VALIDAÇÃO DE DISPONIBILIDADE
  ↓
SE MOTORISTA DISTANTE FOR NECESSÁRIO:
  RECALCULA COMPENSAÇÃO DE COMBUSTÍVEL
  ↓
PAGAMENTO CONFIRMADO/AUTORIZADO
  ↓
DESPACHO / MATCHING
  ↓
CORRIDA
  ↓
CONCLUSÃO
  ↓
COMISSÃO + REPASSE + LEDGER
```

A pré-busca é importante porque a compensação de coleta distante depende da posição dos motoristas, mas o serviço só deve ser efetivamente despachado após pagamento confirmado.

## Máquina de estados alvo

```text
CREATED
  ↓
AWAITING_PAYMENT
  ↓
PAID
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

Estados de exceção deverão incluir:

- PAYMENT_FAILED
- CANCELLED_BY_PASSENGER
- CANCELLED_BY_DRIVER
- CANCELLED_BY_ADMIN
- NO_DRIVER_FOUND
- REFUND_PENDING
- REFUNDED

## Tempo real

O sistema deverá suportar:

- atualização contínua da localização do motorista;
- WebSocket ou canal equivalente;
- reconexão automática;
- recuperação do estado após fechamento/reabertura;
- interpolação visual da posição;
- fallback quando a conexão estiver ruim.

## Dados

A persistência transacional PostgreSQL já existe para corridas, ofertas, disponibilidade do motorista, pagamentos, carteira, ledger e saques. Ainda faltam:

- catálogo geográfico autoritativo para validar todas as localidades específicas;
- histórico/consultas administrativas completos;
- trilha de auditoria administrativa persistente;
- versionamento persistente e vigência das regras de preço;
- estratégia de cache/índice geográfico para escala.

## Segurança

Nunca colocar no Flutter:

- segredo de gateway;
- service-account;
- chaves privadas;
- regras críticas de comissão/preço;
- autorização administrativa baseada apenas em interface.

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
