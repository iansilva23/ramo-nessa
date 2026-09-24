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
- [x] autenticação por telefone/OTP + sessão Bearer + armazenamento seguro
- [x] tela base de pagamento com preço final
- [ ] cobrança Pix real
- [x] endpoint de desenvolvimento para criar registro de pagamento
- [ ] cobrança cartão real
- [ ] interface completa da Carteira Ramo Nessa no app
- [x] consulta de saldo e pagamento da corrida com Carteira
- [x] Core da Carteira: recarga, saldo e pagamento de corrida
- [x] Core confirma pagamento antes de liberar corrida para despacho
- [x] criação inicial de corrida no backend com identidade Bearer; fallback dev apenas fora de produção
- [x] preparação de preço final com reserva curta e coleta roteada
- [x] Passageiro conectado ao endpoint /v1/rides/prepare
- [x] pagamento confirmado dispara matching automaticamente
- [x] motor de elegibilidade e ranking de matching no Core
- [x] criação e aceite persistentes de oferta
- [x] Core WebSocket para entrega realtime da oferta
- [x] app Motorista conectado ao WebSocket com fallback HTTP
- [x] acompanhamento do motorista via polling temporário
- [x] acompanhamento realtime via WebSocket com fallback HTTP
- [ ] chat
- [ ] histórico
- [ ] avaliação

## Etapa 2 — Motorista

- [ ] onboarding
- [ ] documentos
- [x] login OTP somente para motorista previamente provisionado/aprovado
- [ ] cadastro completo de veículo
- [x] capacidade/elegibilidade no Core de matching
- [x] elegibilidade 4x4/rotas no Core
- [x] projeção online/offline no Core
- [x] API Core para online/offline/localização
- [x] controle online/offline no app
- [x] tracking Android em background via foreground service (implementado)
- [ ] validar tracking Android em background em celular real
- [x] criar e validar estrutura iOS do app Motorista
- [x] domínio persistente de ofertas no Core
- [x] API Core para consultar oferta ativa
- [x] recebimento de ofertas via WebSocket com polling fallback
- [x] aceite atômico no Core
- [x] API Core para aceitar/recusar
- [x] aceitar/recusar no app
- [x] navegação externa para coleta e destino
- [ ] navegação interna/turn-by-turn própria
- [x] coordenadas exatas de embarque e destino persistidas no Core
- [x] Cheguei / Iniciar / Finalizar com liquidação
- [x] ganho líquido por corrida exibido
- [ ] painel completo de ganhos bruto/líquido
- [x] saldo e solicitação de saque no app do motorista
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
- [x] autenticação/autorização por sessão Bearer com role passenger/driver
- [x] adapter PostgreSQL em runtime
- [x] schema/migration inicial PostgreSQL para corridas
- [x] elegibilidade/ranking de matching
- [x] oferta/aceite transacional do matching
- [x] despacho inicial automático após pagamento confirmado
- [x] retentativa por recusa/expiração e NO_DRIVER_FOUND
- [x] entrega realtime das ofertas
- [x] sincronização contínua de localização motorista -> Core
- [x] endpoint seguro de tracking do passageiro
- [x] polling temporário passageiro <- localização do motorista
- [x] Core WebSocket para tracking da corrida
- [x] apps conectados ao WebSocket com fallback HTTP
- [x] distância roteada motorista→passageiro para preço final
- [x] período tarifário calculado pelo Core em America/Fortaleza
- [x] distância de entrega em Jeri calculada pelo Core
- [x] validação de zona local declarada contra GPS
- [ ] catálogo geoespacial autoritativo por localidade/destino externo
- [x] máquina de estados inicial de corrida/pagamento
- [ ] adapter de gateway Pix/cartão
- [x] ledger financeiro base e escrow de pagamento
- [x] liquidação 10%/90% sobre tarifa-base + compensação de coleta 100% para motorista
- [x] Carteira do passageiro no Core
- [x] saldo contábil do motorista por ledger
- [x] solicitação e reserva idempotente de saque
- [ ] repasse Pix real ao motorista
- [ ] notificações
- [ ] chat
- [ ] auditoria persistente
- [ ] observabilidade

## Etapa 4 — Admin

- [x] plano de controle por API/CLI com chave hash, escopos e expiração
- [x] provisionamento/aprovação/suspensão de motorista com auditoria
- [x] login humano base com senha + TOTP + sessão curta + anti-bruteforce
- [x] conectar sessão humana às operações administrativas do painel
- [x] frontend/login do painel
- [x] diretório paginado de acesso de motoristas + indicadores reais
- [x] backend cadastral de motorista + veículo separado do matching
- [x] frontend Admin para editar e aprovar perfil + veículo
- [x] frontend Admin para status/revisão de metadados de CNH/CRLV sem expor storage
- [x] diretório read-only de passageiros com busca/filtro/paginação
- [x] backend do dashboard operacional com métricas reais de corridas
- [x] frontend do dashboard operacional com corridas ativas e janela de 24h
- [ ] mapa da frota em tempo real (carros/motos, livres, em corrida, entrega e GPS atrasado)
- [x] backend do diretório administrativo de viagens + detalhe read-only
- [x] frontend de viagens com filtros, paginação e detalhe read-only
- [x] catálogo Admin read-only de preços, localidades, categorias e rotas fixas
- [x] ambiente same-origin de teste para Admin + Core
- [x] smoke E2E do Admin com MFA, motorista, auditoria e logout
- [x] dashboard
- [ ] passageiros
- [ ] motoristas
- [ ] aprovação de documentos com inspeção segura do arquivo privado
- [x] viagens em andamento
- [ ] histórico
- [ ] cancelamentos
- [x] edição/versionamento/vigência de preços para rotas fixas e tarifas por localidade
- [x] edição estrutural versionada de localidades/zonas suportadas
- [x] categorias e elegibilidade comercial versionadas (ativação + exigência 4x4 ao cruzar Jeri)
- [ ] pagamentos/comissões
- [ ] habilitar/desabilitar dinheiro futuramente
- [ ] bloqueios
- [ ] logs administrativos

## Etapa 5 — Produção

- [ ] configurar provider SMS OTP de produção (webhook HTTPS + segredo)
- [x] criar fluxo administrativo de provisionamento/aprovação de motorista

- [x] compilação Android debug validada em CI
- [x] compilação Android release validada tecnicamente em CI
- [x] compilação iOS Simulator validada em CI
- [x] stack Docker de teste com gateway same-origin e Core privado
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


### Fluxo operacional do Motorista
- [x] corrida ativa recuperável após reinício do app
- [x] Core: Cheguei -> DRIVER_ARRIVED
- [x] Core: Iniciar -> IN_PROGRESS
- [x] Core: Finalizar -> COMPLETED
- [x] liquidação idempotente na conclusão
- [x] motorista só é liberado após liquidação
- [x] ligar esses estados à interface Flutter do Motorista
