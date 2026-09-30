# Mercado Pago Payouts — repasses Pix dos motoristas

O Ramo Nessa possui um adaptador nativo para o produto Mercado Pago Payouts.
Ele é separado do Checkout usado para receber pagamentos de corridas.

## O que já está implementado

- criação de payout Pix em `POST /v1/payouts`;
- uma transferência por payout no fluxo atual;
- idempotência usando o ID interno do repasse;
- chave Pix do motorista convertida para os tipos aceitos pelo Mercado Pago;
- consulta do status da transação para reconciliação;
- conclusão interna somente após `success/accredited`;
- falhas/rejeições devolvem o saldo reservado conforme o ledger;
- modo de teste com `X-test-token: true`;
- produção com assinatura Ed25519 do body e `X-enforce-signature: true`;
- reconciliação periódica já existente no Core, sem depender de webhook para funcionar.

## Variáveis

Para ativar o adaptador:

    DRIVER_PAYOUT_PROVIDER_NAME=mercado-pago-payouts

Em teste:

    MERCADO_PAGO_PAYOUT_MODE=test
    MERCADO_PAGO_PAYOUT_ACCESS_TOKEN_TEST=<token de teste da aplicação Payouts>

Em produção:

    MERCADO_PAGO_PAYOUT_MODE=production
    MERCADO_PAGO_PAYOUT_ACCESS_TOKEN=<token produtivo da aplicação Payouts>
    MERCADO_PAGO_PAYOUT_PRIVATE_KEY_BASE64=<mpprivate.pem em base64>

As credenciais de Checkout e de Payouts são tratadas separadamente para evitar
usar acidentalmente um token sem as permissões corretas.

## Chaves Ed25519 para produção

A documentação do Mercado Pago exige assinatura Ed25519 dos requests produtivos.

Gere o par fora do repositório:

    openssl genpkey -algorithm ed25519 -out mpprivate.pem
    openssl pkey -in mpprivate.pem -pubout -out mppublic.pem

A chave pública `mppublic.pem` deve ser enviada ao Mercado Pago pelo processo
de Integrações deles.

A chave privada nunca deve entrar no Git. Para o formato usado pelo deploy:

    base64 < mpprivate.pem | tr -d '\n'

Copie o resultado apenas para o arquivo privado `deploy/prod/.env` em
`MERCADO_PAGO_PAYOUT_PRIVATE_KEY_BASE64`.

## Homologação externa ainda necessária

A integração de código não significa que a conta já está autorizada a enviar
Pix reais. Antes do Go-Live:

1. habilitar Payouts para a aplicação/conta Mercado Pago do negócio;
2. obter as credenciais de teste específicas e executar payouts fictícios;
3. validar criação, processamento, rejeição e reconciliação de status;
4. enviar a chave pública Ed25519 ao Mercado Pago pelo processo de Integrações;
5. ativar/obter as credenciais produtivas de Payouts;
6. validar um payout real controlado de baixo valor;
7. confirmar limites, tarifas e regras comerciais aplicáveis à conta;
8. só então definir `DRIVER_PAYOUT_PROVIDER_NAME=mercado-pago-payouts` no
   ambiente produtivo.

Enquanto `DRIVER_PAYOUT_PROVIDER_NAME` estiver vazio, nenhuma transferência
externa é criada pelo adaptador Payouts.
