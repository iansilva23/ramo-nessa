# Asaas: habilitação de envios em produção com repasses manuais

Autorização: responsável solicitou ativar Asaas em 25/10/2026. A integração existente atende exclusivamente repasses dos motoristas. Recebimentos de passageiros continuam no provedor existente.

## Evidência da VPS e da conta

O responsável executou os diagnósticos. Provedor `asaas`, ambiente `production`, receptor habilitado, sender desabilitado, data de corte `2099-01-01T00:00:00Z`, chave e token disponíveis. Banco: modo manual, automático false, antecipação mínima 5000 centavos e taxa 500 centavos; nenhuma solicitação requested/processing e nenhum evento Asaas persistido.

A consulta autenticada de produção retornou lista completa com exatamente um webhook para `https://app.ramonessa.com.br/v1/webhooks/asaas/transfers`: ativo, fila não interrompida, v3, envio sequencial e todos os sete eventos de transferência necessários. O token não foi retornado. Isso é comportamento documentado, não comprovação de erro: https://docs.asaas.com/docs/criar-novo-webhook-pela-api.

O ADM atualizado foi confirmado pelo responsável com recibo `ADM_DESIGN_ATUALIZADO`, fonte d3e8c5e7c471221b3477aff40b69a46a9b50e5df e A/B/C false. O procedimento Asaas não substitui a imagem do Core ou o Gateway e não reaplica versões antigas dos aplicativos.

## Procedimento preparado

Revisão operacional imutável: `1d74891da61aac7d8c65be13c6093138c0553ece`.

1. Valida o runtime ativo, a política manual, ausência de solicitações pendentes e configurações do receptor de produção.
2. Salva o runtime e os modelos privados em `/opt/ramo-nessa-asaas-production-sender`, pertencente a root e sem acesso público.
3. Sincroniza exclusivamente `authToken` do webhook já existente com o token privado do receptor. Preserva URL, eventos, nome, e-mail, versão, estado e fila; consulta novamente para conferir. Não cria outro webhook. A API permite atualizar apenas campos necessários: https://docs.asaas.com/reference/atualizar-webhook-existente.
4. Usa `servicePlan` e os contratos de runtime existentes para reutilizar a imagem, configuração, credenciais, volumes, redes e opções do Core atual. Altera somente `ASAAS_PAYOUTS_ENABLED=true` e o início permitido de novos repasses.
5. Recria somente Core. Confere saúde, políticas, flags, imagem, ambiente, mounts e outros serviços preservados. Prova o adaptador sem enviar transferências; registros anteriores ao corte, manuais ou de antecipação são recusados.
6. Confere a autenticação HTTPS pública com corpos inválidos, esperando 401 sem token e 400 com token, sem criar eventos financeiros.

Não altera tabelas, migrações, ledger, comissão, saldos, valores ou modo de repasse. Não chama o endpoint de criação de transferências. Habilitar o provedor não habilita a agenda automática e não converte reservas antigas.

Falha após troca bloqueia novos envios e mantém o receptor e a nova data de corte para permitir conciliação de eventuais registros concorrentes legítimos. Nunca restaura banco nem remove reservas. Divergência de implantação ou de política interrompe a operação para conferência. Uma execução já habilitada não é repetida silenciosamente.

## Validação

13 testes de contrato aprovados: delta restrito de ambiente, imutabilidade dos outros campos, estado inicialmente desabilitado, rejeição de sandbox ou receiver incorreto, cadastro único, token ocultado nas consultas, PUT somente do token, falhas, dados concorrentes e contratos de runtime/retorno existentes.

Docker real e PostgreSQL isolados: sucesso e falha com retorno aprovados. Os fingerprints completos das tabelas, incluindo tarifa, corrida, pagamento e ledger, permanecem iguais. Política manual e valores personalizados 5000/500 preservados, flags inalteradas, nenhuma transferência criada, imagem Core idêntica e Gateway intacto. O cadastro remoto foi simulado nesses ensaios; nenhuma conta real foi usada pelo CI.

Evidência: https://github.com/iansilva23/ramo-nessa/actions/runs/40245809293

PR DRAFT: https://github.com/iansilva23/ramo-nessa/pull/76. Sem merge ou publicação nativa. Código de aplicação preservado em relação a 643e6ce8df10bc1e6879e68989dfb1a59c003fd5.

## Estado

Comando pronto para o responsável executar na VPS. Envios de produção ainda não foram confirmados como habilitados. A confirmação exige recibo `ASAAS_PRODUCAO_HABILITADO`. Nenhuma transferência financeira real foi executada ou comprovada nesta etapa. Em modo manual, a execução existente pelo banco continua sendo a operação selecionada; enviar novos repasses pela API depende da seleção explícita de um modo compatível no ADM e de recursos disponíveis na conta.
