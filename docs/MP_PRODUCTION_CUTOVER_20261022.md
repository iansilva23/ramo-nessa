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

## Preparo confirmado pelo operador

O operador confirmou `MP_PRODUCAO_PREPARADA_SEM_ATIVACAO` com SHA-256
`75fd2d66cdf076fe3f2e99d8b53bccb9bb604808c7c1e1c59ee3d9b9cba81b16`.
Conta produtiva autenticada; backup verificado com restauração isolada.
Inventário completo confirmado: 4 corridas AWAITING_PAYMENT, 1 PAYMENT_FAILED,
3 REFUNDED e 1 COMPLETED. Saldos não nulos: carteira +15700, receita +70 e
duas contas de compensação do processador somando -15770 centavos.

## Ativação instrumentada

`activate-mp-production.mjs` recebe somente o SHA-256 revisado do preparo. Antes
de qualquer parada, confere os seis arquivos privados, credenciais e conta,
Compose original e de retorno, imagem atual, todos os arquivos do backup por
streaming, Web/Caddy, arquivos montados e identidades de todos os serviços.
Recusa bypasses de desenvolvimento ativos, porta direta do Core, mudança de
dados financeiros ou plano com mais de 24 horas. O NODE_ENV permanece como está:
esta operação troca o provedor de pagamentos para produção, sem declarar a
infraestrutura inteira homologada para lançamento.

A pausa para a troca para e depois reinicia o MESMO container do Gateway; Core
é recriado com a MESMA imagem e os ambientes preparados. PostgreSQL, mapas e site
não são reiniciados. Não edita Caddy, Web, ADM, aplicações móveis, preços ou Asaas.
O Core não fica exposto aos usuários antes da validação privada. Há uma breve
indisponibilidade dos apps Web durante a pausa.

O worker local compartilha o namespace de rede do PostgreSQL confirmado e usa
loopback para o mesmo banco. A conexão privada entra por stdin e nunca em argv.
Não monta as chaves dos provedores nem o volume de documentos. O filesystem é
somente leitura, exceto a pasta privada de recibos; o worker temporário usa root
sem capabilities, com no-new-privileges. Os módulos copiados para sua pasta são
explicitamente root:root 0600. Nenhuma capacidade ou permissão do Core/Gateway
é alterada; a parada respeita o timeout já configurado no container.

Dentro de uma transação serializable com locks exclusivos, o worker confere
novamente TODOS os registros do inventário e as configurações. Arquiva os saldos
de teste através de lançamentos novos e balanceados, com contrapartida no namespace
`archive:test-mp-20261022:`. Carteira, receita e contas de compensação operacionais
começam em zero; as entradas antigas permanecem intactas. Não é estorno real e
não chama nenhuma API financeira. Cancela o único pagamento `created`, registra
evento com a confirmação do proprietário e o operador `vps-root`, encerra as cinco
corridas de teste abertas e altera apenas Public Key/data da configuração
operacional. Categorias, tarifas, usuários e todos os movimentos concluídos são
preservados. Não impersona um usuário ADM; a auditoria técnica fica nos recibos
privados, no ledger e nos eventos de pagamento.

O recibo com estado anterior/posterior é fsynced antes do COMMIT, permitindo
distinguir confirmação perdida de transação desfeita. A referência única evita
compensação duplicada. Retorno anterior à liberação pública usa lançamentos
inversos novos e restaura somente os campos alterados, mantendo todo o histórico.
Mudança concorrente recusa reversão automática. Não restaura dump sobre dados
ativos. Depois que o Gateway PODE ter sido reaberto, nenhuma reversão financeira
automática é permitida, pois já pode existir uma transação real.

Antes da liberação, o Core real comprova saúde, fonte da chave de cartão,
simulação Pix desligada, ausência do token de teste na candidata, Asaas sem
envios e rejeição de webhook sem assinatura válida. Depois, verifica HTTP público
e publicação da Public Key. O registro impede repetição cega e não é sobrescrito
por uma nova tentativa rejeitada. Interrupções anteriores à abertura solicitam
retorno nos pontos seguros; encerramento forçado exige conferir os recibos.

O sucesso de configuração ainda NÃO aprova cobrança/liquidação: Public Key em
tokenização real, Pix, cartão, recarga, webhook externo e estorno precisam de
aceite real. As credenciais de teste e os históricos permanecem protegidos no
backup/retorno e não ficam ativos no Core produtivo.

## Aceite da implementação de ativação

Código validado: `d6697c4b0dfb2dcd9d1fd72527f45ec9fc9336f9`.

- [Preparo](https://github.com/iansilva23/ramo-nessa/actions/runs/39721221611):
  11 testes aprovados, sem falhas ou skips.
- [Ativação isolada](https://github.com/iansilva23/ramo-nessa/actions/runs/39721221919):
  testes unitários de fronteira da liberação e testes com PostgreSQL migrado
  aprovados; arquivamento único, concorrência, falha de gravação de recibo,
  reversão e recusa de mudanças concorrentes exercitados.
- Os dois jobs `actual_switch (success)` e `actual_switch (rollback)` passaram
  com Core compilado real, Caddy e PostgreSQL descartáveis, usando o backup
  completo com restauração isolada. Comprovaram pausa/liberação HTTP, Public Key
  publicada, imagens inalteradas, Asaas sem envios, saldos zero no sucesso,
  restauração dos R$157 e estados anteriores na falha provocada, histórico
  preservado e recusa de repetição sem sobrescrever o registro da primeira troca.

Os ensaios identificaram e corrigiram permissões dos módulos privados copiados,
configuração de parada e comparação não canônica de mounts do Docker. Os módulos
agora recebem root:root explícito e o worker continua sem capabilities; a
conferência usa identidade canônica sem ignorar conteúdo de mounts/configurações.
Não alteraram serviços ou dados da VPS do proprietário.

Comando de ativação: extrair `deploy/staging` do commit validado e executar com
sudo `activate-mp-production.mjs` seguido do SHA-256 confirmado do preparo acima.
Nenhuma credencial precisa ser digitada novamente. Resultado de configuração:
`MERCADO_PAGO_PRODUCAO_ATIVADO`. Em caso de mensagem de retorno/revisão, conferir
o registro privado antes de qualquer repetição. A confirmação de execução na VPS
e o aceite financeiro real continuam pendentes na entrega deste código.
