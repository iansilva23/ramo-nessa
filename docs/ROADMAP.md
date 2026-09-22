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
- [ ] persistência e infraestrutura final do backend

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
- [ ] tela/fluxo Pix
- [ ] tela/fluxo cartão
- [ ] Carteira Ramo Nessa
- [ ] confirmação de pagamento antes do despacho
- [ ] solicitar serviço no backend
- [ ] matching real
- [ ] acompanhamento em tempo real
- [ ] chat
- [ ] histórico
- [ ] avaliação

## Etapa 2 — Motorista

- [ ] onboarding
- [ ] documentos
- [ ] veículo e capacidade
- [ ] elegibilidade 4x4/rotas
- [ ] online/offline
- [ ] GPS em background
- [ ] recebimento de ofertas
- [ ] aceitar/recusar
- [ ] navegação/coleta
- [ ] início e finalização
- [ ] ganhos bruto/líquido
- [ ] carteira/repasse
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
- [x] comissão de 10%
- [x] política de pagamento v1 (Pix/cartão/carteira; dinheiro desligado)
- [x] endpoint de cotação
- [x] testes e CI do domínio comercial
- [ ] validação de schema das requisições HTTP
- [ ] autenticação e autorização
- [ ] persistência/Postgres
- [ ] matching
- [ ] localização em tempo real
- [ ] máquina de estados
- [ ] integração real Pix/cartão
- [ ] ledger/carteira do passageiro
- [ ] saldo/repasse do motorista
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
