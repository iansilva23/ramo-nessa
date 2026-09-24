# Pagamentos e comissão v1 — Ramo Nessa

Status: APROVADO para implementação.
Data-base: 2026-09-22.

## Lançamento: 100% digital

Formas habilitadas:

- Pix pelo app;
- cartão pelo app, sempre à vista (1x), sem parcelamento;
- saldo da Carteira Ramo Nessa.

Formas desabilitadas:

- dinheiro;
- Pix direto para motorista.

O serviço só pode entrar em matching/despacho quando o pagamento estiver confirmado ou quando o provedor de pagamentos tiver autorizado/reservado o valor necessário.

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
- estorno conforme a política de cancelamento quando ela for definida;
- créditos promocionais separados do saldo financeiro quando necessário.

A implementação financeira real deve usar provedor de pagamentos adequado; não construir custódia financeira própria no app.

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
