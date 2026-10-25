# Homologação de corridas — preparação

Código funcional validado: 3c5fa5e5; dez jobs aprovados na execução 40232751441. O commit d33b75ec acrescenta somente o relatório. PR #72 permanece DRAFT. Não houve publicação ou ativação.

## Baseline atual

Diagnóstico executado pelo responsável e recebido em 25/10/2026. Core b2e1742a4811bfd9455f550612628986871d9d00d2c9ec79242e907d4c51cc4d e gateway afd2bf7ee10435bf192c150d048310db027f81cb3334ce5ea5038307f7ca982f running; Web em /opt/ramo-nessa-web/releases/driver-cinema-d8ddfb102f88/bundles. Banco até migração 095. Migrações 096/097 ausentes; política de ocorrências e tabelas de ocorrências/bônus retornaram table_absent. Embarque false/revisão 0, cancelamento manual false/revisão 4. Pagamentos: dinheiro/Pix/carteira habilitados, cartão desabilitado. Nenhuma modificação foi realizada pelo diagnóstico. O diagnóstico agora inclui B/C e contagens agregadas, sem relatos pessoais. `table_absent` em B/C significa que a estrutura ainda não está instalada; não significa configuração falsa. Comparar com a evidência anterior: migração 095, Web driver-cinema-d8ddfb102f88, embarque e cancelamento manual desligados. Não executar instaladores dos PRs #62/#69 sobre versões novas sem verificar compatibilidade.

## Ambiente de teste necessário

Antes de testes com recursos ativados, preparar ambiente separado com banco próprio e contas de teste, sem usuários, dinheiro ou credenciais de produção. Preservar os controles da VPS. Usar o código validado, aplicar migrações em banco de homologação e comprovar A/B/C desligados. Os builds do CI usam example.invalid, sem credenciais reais: não são pacotes para instalar em aparelhos. Android físico exige build de homologação configurado; iPhone físico exige assinatura/perfil e distribuição de teste apropriados. Não tratar WebKit como teste em iPhone.

## Sequência e evidências

| Cenário | Resultado esperado | Evidência a registrar |
|---|---|---|
| A/B/C desligados | Fluxo anterior preservado; atualização não ativa recursos | Configuração antes/depois e IDs de teste |
| Dinheiro cancelado pelo motorista | Histórico identifica cancelamento; sem cobrança digital | Mesmo ID no backend e nas telas |
| Checkout vencido sem pagamento | Solicitação expirada, sem botão de pagar | Estado exibido e ausência de pagamento |
| Fechar/reabrir Web e aparelhos | Início acessível; retomada por Atividades sem ação financeira | ID da corrida/pagamento antes/depois |
| Ativar somente A em homologação | Código de três dígitos; bloqueio após cinco erros | Tentativas persistidas, retomada e liberação pelo suporte |
| Ativar somente B em homologação | Opções de interrupção e suporte vinculados | Duas versões e um atendimento |
| Pix mecânico / continuar | Mesma corrida, destino e pagamento; substituto por ETA | Ofertas de 35s, GPS do substituto e zero ao primeiro motorista |
| A+B / substituição | Novo código de três dígitos; anterior rejeitado | Histórico de embarques e cinco tentativas independentes |
| Ninguém aceita / GPS indisponível | Devolução ou suporte; sem localização/ETA inventados | Estado real e ausência de nova cobrança |
| Devolução Pix | Somente confirmação financeira encerra devolução | ID da operação e resposta do provedor |
| Dinheiro interrompido | Recebimento/devolução físicos, confirmação ou contestação | Relatos e decisão ADM; nenhuma transferência automática |
| Contestar encerramento | Nenhuma sanção automática pela acusação | Relatos das duas partes e decisão justificada |
| C em homologação / próxima Pix | Bônus separado ao prejudicado; comissão só sobre tarifa normal | Total, ledger, destinatários e retry idempotente |
| C em homologação / próxima dinheiro | Bônus físico integral ao próximo motorista | Valor a receber e comissão normal, sem crédito digital fictício |
| Próxima cancelada/reembolsada | Sem cobrança/compensação duplicada | Reserva liberada ou revisão após liquidação |
| Internet cai antes/depois da confirmação | Retomar estado persistido sem repetir operação | Mesmos IDs e referências únicas no ledger |

Após cada grupo, desligar explicitamente as políticas do ambiente de teste e verificar persistência. Alterar controles não muda regras de corridas já iniciadas; criar novas corridas para cada combinação. Operações sandbox devem ser rotuladas como simuladas. Antes de qualquer teste financeiro real, preparar caso concreto com valor, contas, provedor, efeito esperado e autorização correspondente. Nenhuma evidência automatizada substitui a confirmação bancária real.

## Bloqueios atuais

Sem sessão SSH disponível nesta execução; a leitura da VPS depende da saída do diagnóstico executado pelo responsável. Ainda não foram identificados ambiente separado, domínio de homologação, distribuição para aparelhos ou credenciais de teste. Não criar esses valores por suposição. A próxima decisão de pacote depende dessa baseline; este documento não autoriza instalar ou ativar recursos na VPS.


## Preparação após o diagnóstico recebido

A VPS ainda não recebeu as correções; fetch apenas baixa objetos Git. As seis tentativas dos prints continuam sem motorista, método ou registro financeiro e com prazo vencido. Os cancelamentos reais em dinheiro permanecem CANCELLED_BY_DRIVER. Não cancelar esses registros em lote nem criar devolução bancária.

A configuração deploy/staging/compose.yml não deve ser iniciada novamente como ambiente de teste: ela usa o nome ramo-nessa-staging e publica portas 80/443, correspondentes ao ambiente observado. Uma homologação adicional requer projeto Compose, banco, volumes, imagens e endereço próprios. Não compartilhar DATABASE_URL, volumes, nomes de projeto ou credenciais do ambiente ativo. O nome staging existente não prova isolamento de usuários reais.

Falta identificar o domínio/subdomínio de homologação (ou a ausência dele), o destino de hospedagem e a forma de acesso dos aparelhos. Sem isso não gerar URLs presumidas nem instaladores apontando para o serviço ativo. Não é necessário repetir a consulta da VPS já recebida.

## Execução recebida do responsável — ambiente isolado na VPS

Docker Compose v5.5.1; host com 3,7 GiB totais, 2,8 GiB disponíveis na consulta e 19 GB livres. Configuração em /opt/ramo-homologacao-config-99ea1989, projeto ramo-nessa-occurrence-homologation. Imagens específicas de Core e gateway compiladas pelo responsável; fontes exportados separadamente do checkout ativo. Banco novo criado e migrações 001–097 concluídas. Consulta explícita comprovou A/B/C false e zero corridas/pagamentos.

Após aplicar runtime-health.json, PostgreSQL, simuladores, Core e gateway ficaram healthy; migrate terminou. GET http://127.0.0.1:18080/ready retornou ok true e storageMode postgres. O gateway de teste permanece em loopback.

O responsável executou smoke-occurrences.mjs do commit cc2a141ea38906f0b34f128de9b71df3172f852a no Core isolado. Retorno ok true, simulated true e oito verificações aprovadas: estado inicial, independência/snapshot das regras, isolamento do passageiro, substituição mantendo corrida/pagamento/destino e novo PIN de 3 dígitos, cinco erros persistidos com liberação e suporte sincronizado, devolução física sem transferência, liquidação simulada sem comissão no bônus ou duplicidade, e limpeza final. A liquidação desse roteiro usa repositório em memória; ocorrências e embarques usam PostgreSQL em esquema temporário. Não houve gateway financeiro externo nem recebimento/devolução/repasse real.

Isso comprova a inicialização e o roteiro automático do backend isolado, não a homologação em aparelhos, GPS/rede reais ou a publicação das correções no app ativo. Próxima etapa: acesso ao ADM isolado por túnel SSH local no Mac, sem DNS ou publicação de porta nova. Ainda não foram criadas credenciais humanas de teste neste roteiro.
