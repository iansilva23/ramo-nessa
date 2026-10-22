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

## Preparação após captura confirmada

O proprietário confirmou `CREDENCIAIS_MP_ARMAZENADAS`, sem alterações de runtime,
saldo ou Asaas. A pasta compartilhada root:root 0755 permanece intacta; apenas
a subpasta específica exige 0700 e o arquivo 0600. A captura recusa escrita por
outros usuários no pai, links simbólicos e substituição de arquivos existentes.

`prepare-mp-production.mjs` autentica o token por GET no host fixo do Mercado
Pago, recusa conta de teste e país diferente de MLB, prepara Compose do Core
com a mesma imagem, configura production, desliga a simulação e remove o token
de teste da candidata. Não aplica o Compose e não altera a Public Key ativa.
Asaas e todos os campos não relacionados ao Mercado Pago são preservados.

O inventário financeiro usa transação repeatable-read/read-only e fica privado.
A saída contém totais e estados sem identificar passageiros, motoristas ou corridas.
Reutiliza o backup existente de banco/documentos/configurações/Web/imagens, com
restauração PostgreSQL isolada. Confere mudanças concorrentes, SHA-256 de arquivos
e identidade dos serviços antes de concluir. Uma falha preserva evidências na
subpasta `preflight` e recusa repetição cega; nenhum serviço ativo é atualizado.

Código validado: f3061ce8680692ce7f9be5bdbd5e9e761d2432b0.
[CI da preparação](https://github.com/iansilva23/ramo-nessa/actions/runs/39718832267):
11 testes aprovados, sem skips, incluindo PostgreSQL real descartável, captura
privada, GET autenticado simulado, rejeição de conta de teste e escopo da candidata.
Não foram usadas credenciais reais nem chamadas financeiras no CI.

O GET valida autenticação e identificação da conta; não prova pareamento da
Public Key, permissões Orders, entrega externa do webhook ou liquidação. O teste
de aceitação desses itens e a compensação reversível dos saldos de teste continuam
pendentes. O preparo instalado exige o resultado real antes da ativação.
