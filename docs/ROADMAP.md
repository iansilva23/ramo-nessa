# Roadmap — Ramo Nessa

## Etapa 0 — Fundação

- [x] nome Ramo Nessa
- [x] repositório privado
- [x] arquitetura inicial documentada
- [x] direção de design definida
- [x] auditoria das principais fontes de código selecionadas
- [x] matriz USAR / ADAPTAR / REFERÊNCIA / NÃO INCORPORAR
- [x] design tokens iniciais
- [x] regras comerciais e preços v1 aprovados
- [x] política de pagamentos e comissão v1 aprovada
- [x] stack inicial do Core definida: Node.js + TypeScript
- [ ] infraestrutura/deploy final do backend

## Etapa 1 — Passageiro

- [x] projeto Flutter Android/iOS
- [x] Design System inicial
- [x] permissões de localização em primeiro plano
- [x] mapa real em ambiente de desenvolvimento
- [x] origem por GPS
- [x] origem manual
- [x] busca explícita de destino
- [x] rota, distância e ETA reais
- [x] Carro / Moto / Entrega no domínio
- [x] Comfort/Black e Buggy no domínio/seletor
- [x] categorias filtradas por elegibilidade comercial da rota
- [x] contador de 1–4 passageiros para preço do Buggy
- [x] cliente de cotação comercial do Core
- [x] remoção do preço comercial autoritativo do Flutter
- [x] Aeroporto JJD incluído na área operacional inicial
- [x] CI, testes e build Android de validação
- [x] busca controlada dos destinos longos aprovados na tabela comercial
- [ ] splash/onboarding final
- [ ] autenticação
- [x] tela base de pagamento com preço final
- [ ] cobrança Pix real
- [x] endpoint de desenvolvimento para criar registro de pagamento
- [ ] cobrança cartão real
- [ ] interface completa da Carteira Ramo Nessa no app
- [x] consulta de saldo e pagamento da corrida com Carteira
- [x] Core da Carteira: recarga, saldo e pagamento de corrida
- [x] Core confirma pagamento antes de liberar corrida para despacho
- [x] criação inicial de corrida no backend (dev identity; aguardando auth)
- [x] preparação de preço final com reserva curta e coleta roteada
- [x] Passageiro conectado ao endpoint /v1/rides/prepare
- [x] pagamento confirmado dispara matching automaticamente
- [x] motor de elegibilidade e ranking de matching no Core
- [x] criação e aceite persistentes de oferta
- [ ] entrega realtime da oferta ao app
- [ ] acompanhamento em tempo real
- [ ] chat
- [ ] histórico
- [ ] avaliação

## Etapa 2 — Motorista

- [ ] onboarding
- [ ] documentos
- [ ] cadastro completo de veículo
- [x] capacidade/elegibilidade no Core de matching
- [x] elegibilidade 4x4/rotas no Core
- [x] projeção online/offline no Core
- [x] API Core para online/offline/localização
- [ ] controle online/offline no app
- [ ] GPS em background
- [x] domínio persistente de ofertas no Core
- [x] API Core para consultar oferta ativa
- [ ] recebimento de ofertas no app
- [x] aceite atômico no Core
- [x] API Core para aceitar/recusar
- [ ] aceitar/recusar no app
- [ ] navegação/coleta
- [ ] início e finalização
- [ ] ganhos bruto/líquido
- [ ] carteira/repasse no app do motorista
- [x] saldo e reserva de saque no Core
- [ ] histórico e avaliações

## Etapa 3 — Core

- [x] projeto Node.js + TypeScript
- [x] endpoint inicial de saúde
- [x] catálogo comercial v1 em código
- [x] cotação por rota/localidade
- [x] regras de horário/noturno aprovadas
- [x] compensação de coleta distante
- [x] Comfort/Black + R$ 50 quando aplicável
- [x] bloqueio comercial de Carro comum em rotas 4x4 de Jeri
- [x] comissão de 10% sobre tarifa-base; compensação de coleta isenta
- [x] política de pagamento v1 (Pix/cartão/carteira; dinheiro desligado)
- [x] endpoint de cotação
- [x] testes e CI do domínio comercial
- [x] validação runtime das requisições de cotação
- [ ] autenticação e autorização
- [x] adapter PostgreSQL em runtime
- [x] schema/migration inicial PostgreSQL para corridas
- [x] elegibilidade/ranking de matching
- [x] oferta/aceite transacional do matching
- [x] despacho inicial automático após pagamento confirmado
- [x] retentativa por recusa/expiração e NO_DRIVER_FOUND
- [ ] entrega realtime das ofertas
- [ ] localização em tempo real
- [x] distância roteada motorista→passageiro para preço final
- [x] máquina de estados inicial de corrida/pagamento
- [ ] adapter de gateway Pix/cartão
- [x] ledger financeiro base e escrow de pagamento
- [x] liquidação 10% plataforma / 90% motorista após corrida concluída
- [x] Carteira do passageiro no Core
- [x] saldo contábil do motorista por ledger
- [x] solicitação e reserva idempotente de saque
- [ ] repasse Pix real ao motorista
- [ ] notificações
- [ ] chat
- [ ] auditoria persistente
- [ ] observabilidade

## Etapa 4 — Admin

- [ ] dashboard
- [ ] passageiros
- [ ] motoristas
- [ ] aprovação de documentos
- [ ] viagens em andamento
- [ ] histórico
- [ ] cancelamentos
- [ ] preços, localidades, zonas e vigência
- [ ] categorias e elegibilidade
- [ ] pagamentos/comissões
- [ ] habilitar/desabilitar dinheiro futuramente
- [ ] bloqueios
- [ ] logs administrativos

## Etapa 5 — Produção

- [x] compilação Android debug validada em CI
- [x] compilação Android release validada tecnicamente em CI
- [x] compilação iOS Simulator validada em CI
- [ ] deploy seguro do Core
- [ ] provedor comercial de mapas/geocoding/rotas
- [ ] testes reais com dois celulares
- [ ] internet ruim/reconexão
- [ ] testes de background do Motorista
- [ ] assinatura Android de produção
- [ ] Apple Developer Team + assinatura/dispositivo iOS
- [ ] segurança de produção
- [ ] LGPD
- [ ] políticas de privacidade/termos
- [ ] beta
- [ ] publicação
