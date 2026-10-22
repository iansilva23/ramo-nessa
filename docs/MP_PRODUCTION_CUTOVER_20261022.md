# Preparação das credenciais produtivas

O proprietário confirmou em 22/10 que todos os movimentos financeiros existentes
eram testes. Inventário confirmado: pagamentos created 1/737, failed 1/737,
paid 1/700, refunded 3/3097; recargas cancelled 1/100, paid 8/16400,
refunded 2/200; repasses paid 1/630; uma carteira com 15700 centavos.
Os totais não identificam isoladamente cada registro; qualquer transição exige
conferência atualizada dos registros e saldo, isolamento de concorrência e backup.

Runtime confirmado: Core sha256:8020dd70b5aeb81ddd857f28293c475cc50f6d4708588a8963d7d20223b462be,
Mercado Pago test, Pix simulado true, sem token produtivo, webhook configurado;
Asaas production com payouts false. Compose ativo privado:
/opt/ramo-nessa-google-search/731d524d55ec/core-after.compose.private.json.

`capture-mp-production.mjs` recebe três campos separados por NUL via stdin:
Public Key, Access Token e assinatura secreta do webhook de produção. O operador
digita pelo terminal com eco desligado; os campos não vão em argv, histórico,
ambiente exportado, logs, repositório ou chat. Valida formato básico e armazena
JSON root-only em /opt/ramo-nessa-private/mp-production-20261022.
Não sobrescreve preparação existente. Formato APP_USR não comprova, sozinho,
autorização da conta ou vínculo entre credenciais: validação remota ainda necessária.

Esta etapa não altera serviços ou banco, não aprova Pix, não cobra, não estorna,
não habilita Asaas e não muda a Public Key no ADM. O próximo estágio deverá
verificar credenciais/conta e webhook, preservar histórico, tratar saldos e
movimentos de teste com evidência reversível, desligar a simulação e coordenar
Public Key/Access Token de produção. A abertura a pagamentos reais permanece
pendente dessa transição e da homologação Pix, cartão, carteira e reembolso.
