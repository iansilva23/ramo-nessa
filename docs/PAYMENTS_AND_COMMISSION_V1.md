# Pagamentos e comissão v1 — Ramo Nessa

Status: APROVADO para implementação.
Data-base: 2026-09-29.

A arquitetura de pagamentos e comissão descrita abaixo está implementada. Alterações futuras de percentuais, ajustes ou políticas financeiras continuam sujeitas ao fluxo versionado/auditado do ADM e à homologação operacional dos provedores antes da produção.

## Lançamento: 100% digital

Formas habilitadas:

- Pix pelo app;
- cartão pelo app, sempre à vista (1x), sem parcelamento;
- saldo da Carteira Ramo Nessa.

Formas desabilitadas:

- dinheiro;
- Pix direto para motorista.

O serviço só pode entrar em matching/despacho quando o pagamento estiver confirmado ou quando o provedor de pagamentos tiver autorizado/reservado o valor necessário.

## Preço por forma de pagamento

- Pix usa, por padrão, ajuste de 0,99% (`99 bps`) sobre o preço final, com gross-up em centavos para preservar a tarifa-base. O percentual pode ser alterado no Financeiro do ADM, inclusive para zero.
- Cartão usa ajuste configurável no Financeiro do ADM e também apresenta o total final antes da confirmação.
- Carteira não recebe ajuste de processamento.
- O Core é a autoridade do cálculo; o Passageiro apenas exibe o total devolvido pela política e confirma a cobrança.
- Ajustes de Pix/cartão ficam separados no ledger em `platform:payment_fee_recovery` e não aumentam a comissão da plataforma nem reduzem os 90% do motorista sobre a tarifa-base.

## Comissão

- Ramo Nessa: 10% da tarifa-base.
- Motorista/prestador: 90% da tarifa-base.
- A compensação de coleta distante é adicional ao total do passageiro, mas vai 100% para o motorista e não sofre comissão.
- A regra de 10%/90% sobre a tarifa-base se aplica a Moto, Entrega, Carro, Buggy, Comfort/Black e transfers.

Exemplo:

```text
tarifa-base: R$ 150
Ramo Nessa (10% da base): R$ 15
motorista (90% da base): R$ 135

Se houver R$ 7 de compensação de coleta:
total do passageiro: R$ 157
Ramo Nessa: R$ 15
motorista: R$ 142
```

## Carteira do Passageiro

A Carteira Ramo Nessa permite ao passageiro adicionar saldo e pagar serviços sem gerar um novo pagamento a cada solicitação.

Requisitos:

- saldo disponível;
- histórico de entradas e saídas;
- recarga por meios suportados pelo provedor;
- débito somente após confirmação da solicitação;
- estorno conforme a política de cancelamento e falta de motorista descrita abaixo;
- créditos promocionais separados do saldo financeiro quando necessário.

A implementação financeira real deve usar provedor de pagamentos adequado; não construir custódia financeira própria no app.

## Falta de motorista, cancelamento e reembolso

Depois do pagamento, se uma rodada de busca terminar sem motorista:

- a corrida fica em `NO_DRIVER_FOUND`; o pagamento continua protegido e não é repassado a motorista;
- o Passageiro pode escolher **Tentar novamente**, sem nova cobrança, iniciando outra rodada de busca;
- o Passageiro pode escolher **Cancelar corrida**, o que inicia reembolso integral automático;
- se o Passageiro não escolher nenhuma opção, o Core encerra a busca depois do prazo operacional configurado no ADM. O padrão é 900 segundos (15 minutos), configurável entre 60 e 3600 segundos, e inicia o reembolso integral;
- uma nova tentativa reinicia o prazo quando a nova rodada também termina sem motorista.

O Motorista pode cancelar uma corrida atribuída antes ou depois do início, sempre informando um motivo. O cancelamento encerra a corrida para o Motorista e inicia reembolso integral automático ao Passageiro.

Motivos operacionais incluem passageiro ausente, pedido do passageiro, comportamento inadequado, ameaça/agressão, assédio, local inseguro/inacessível, problema no veículo, emergência pessoal ou outro motivo justificado.

Quando o cancelamento ocorre durante `IN_PROGRESS`, o reembolso integral ao Passageiro não espera análise manual. O caso é enviado ao ADM para avaliar separadamente eventual compensação ao Motorista. Motivos de segurança também geram revisão administrativa.

Para Carteira Ramo Nessa, o estorno é conciliado no ledger interno. Para Pix/cartão Mercado Pago, o Core solicita o reembolso ao provedor com idempotência e só marca a corrida como `REFUNDED` após confirmação. Enquanto isso, usa `REFUND_PENDING`. Reembolsos pendentes são reconciliados automaticamente; o app não deve prometer que o banco/cartão exibirá o valor instantaneamente.

Nenhum cancelamento do Motorista liquida a corrida como concluída nem libera os 90% ao Motorista. Qualquer compensação aprovada após cancelamento em andamento é uma decisão financeira separada da tarifa da corrida.

## Saldo do Motorista

O motorista deve visualizar:

- valor bruto de cada serviço;
- comissão Ramo Nessa;
- valor líquido;
- saldo disponível;
- valores pendentes;
- histórico de repasses/saques.

O backend é a autoridade contábil. O app não deve calcular ou alterar saldo de forma autoritativa.

## Dinheiro — recurso futuro, desativado

Se dinheiro for ativado futuramente:

- passageiro paga o valor integral ao motorista;
- 10% vira comissão devida ao Ramo Nessa;
- limite de comissão pendente: R$ 120;
- ao atingir R$ 120, novas corridas em dinheiro são bloqueadas;
- corridas digitais podem compensar automaticamente o saldo devedor;
- a regra só entra em vigor quando o Admin habilitar dinheiro.

Na v1 de lançamento, toda essa lógica permanece desativada.

## Segurança operacional

- registrar pagamento e transação com IDs idempotentes;
- impedir despacho duplicado após reenvio de callback;
- validar valor no backend;
- registrar auditoria de comissão e repasse;
- nunca confiar em preço calculado apenas no cliente;
- usar confirmação de início/finalização da corrida e trilha de estado no Core;
- PIN/GPS podem ser usados como proteção operacional contra fraude conforme o fluxo de corrida for implementado.
