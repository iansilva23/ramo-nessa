# Custos & Resultado no ADM

Página própria `/admin/custos-resultado`, com permissões `costs:read` e
`costs:write`. A migração 080 concede as permissões correspondentes aos
usuários e chaves que já possuem acesso financeiro. Novos funcionários
recebem acesso pelo proprietário na gestão de funcionários.

Este é um controle gerencial: não altera preços, saldo, ledger, cobrança do
passageiro ou repasse ao motorista. O Financeiro continua apresentando seus
valores originais. Para oferecer Pix sem acréscimo ao passageiro, o ajuste
de preço Pix na configuração financeira precisa permanecer em zero.

## Receitas e custos

- Comissão: lançamentos de liquidação de corrida e comissão de corrida em dinheiro.
- Outras receitas e acréscimos de pagamento: contas correspondentes do ledger.
- Saques do proprietário não são despesas operacionais.
- Cupons financiados pela empresa entram como custo confirmado, incluindo reversões.
- Ajustes externos ainda em revisão aparecem como estimativa.
- Despesas manuais podem ser confirmadas ou estimadas e podem ser canceladas,
  preservando o registro e a auditoria.
- Regras permitem custos mensais, por corrida liquidada, por Pix/cartão recebido
  (valor fixo mais percentual do recebimento) ou percentual sobre a comissão.

A migração cria uma previsão de R$ 0,99 por Pix recebido, valor declarado pelo
proprietário. Sua vigência começa na data da instalação. Não é uma tarifa
verificada junto ao provedor. Tarifas por operação são sempre estimativas;
use “Registrar valor confirmado” para informar a cobrança efetiva. Um pagamento
recebido e depois estornado ainda pode ter gerado custo de processamento.

O custo efetivo vinculado ao mesmo pagamento/corrida e tipo substitui a
previsão, inclusive quando registrado em outro dia. Para substituir a previsão
mensal, vincule a despesa à regra mensal e ao mês correspondente. Uma fatura
agregada deve usar tipo próprio para não ser confundida com taxa individual.

Mensalidades vencem no dia da data inicial (dia 31 vira o último dia em meses
curtos). Não há rateio diário nem distribuição dos custos fixos por corrida.
Para trocar uma tarifa, encerre a vigência antiga e crie outra, sem sobrepor
datas do mesmo tipo. Valores antigos não são editados retroativamente.

## Resultado e segurança

Receita gerencial = comissão + outras receitas + acréscimos recuperados.
Resultado confirmado = receita gerencial menos custos confirmados.
Resultado incluindo estimativas desconta também os custos estimados.
Isso não representa saldo disponível para saque, nem lucro completo se ainda
existirem despesas não cadastradas. Comissão de corrida em dinheiro é receita
registrada e não necessariamente recebida em caixa.

Datas usam Fortaleza. Consultas aceitam até 367 dias; detalhes exibem até 500
linhas, mas totais consideram todas. Acima de 50 mil operações, o servidor exige
intervalo menor. Custos e auditoria são gravados juntos em transação;
concorrência usa revisão e criação pode ser repetida com o mesmo ID sem duplicar.

## Instalação

Atualize o código e execute `sudo node deploy/staging/start.mjs`: o serviço de
migração aplica a tabela, permissões e regra inicial. Entre novamente no ADM se
a sessão antiga ainda não tiver as permissões novas. Nenhuma atualização de APK
é necessária para esta página.
