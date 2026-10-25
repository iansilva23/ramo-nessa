# Auditoria e integração de corridas e ocorrências

Base examinada: PR #71, `d8ddfb102f88269083b64bccd44860d05e3703cb`.
Esta base contém os commits dos PRs #57, #61 e #67 como ancestrais.
Em relação ao PR #67, as alterações são oito arquivos do Motorista (GPS/câmera/testes), preservados nesta integração.

## Matriz de evidências antes de editar

| Requisito | Evidência | Classificação | Integração mínima |
|---|---|---|---|
| Identificação/cancelamento/devolução manual | PR #57; manual-cancellation-store/routes/policy | Implementado, homologação atual não verificada | Preservar regras, corrigir autoria administrativa |
| Embarque 3 dígitos/5 tentativas | Migração 094; boarding-store; testes PostgreSQL condicionais | Implementado, aparelho não verificado | Preservar; adicionar histórico de embarques para substituição |
| Atividades/retomada/pagamento original | PR #67; activity-service, ride-resumption, resumed_ride_screen | Implementado, bug observado | Atualizar fora da aba, revalidar estado e não abrir checkout encerrado |
| Instalação Web | PR #69, instalador r2 | Em outra branch; VPS não verificada nesta sessão | Não executar instalador antigo nem presumir estado publicado |
| Design/GPS motorista | PR #43/#64 e base #71 | Implementado; aparelho não verificado | Não alterar os oito arquivos de GPS nesta correção |
| Cancelamento explícito de reserva | server.ts chama releasePrepaymentHold; método só libera motorista | Conflitante | Diferenciar desistência de expiração, persistir cancelamento e notificar passageiro |
| Aviso do Início | Atualizado por PassengerActivityScreen somente quando visível | Conflitante | Consulta também com aba fechada; sinalizar erro sem inventar estado |
| Responsável pelo cancelamento | Componente compartilhado mostra Cancelada; cancelamento ADM grava CANCELLED_BY_PASSENGER | Conflitante | Preservar autoria no estado e apresentação |
| Pix tardio após encerramento | Confirmação exige AWAITING_PAYMENT | Parcial | Conciliar e reembolsar sem reabrir viagem; preservar caminho manual |
| Substituição Pix em andamento | Não há fluxo específico encontrado na base | Pendente | Ocorrência persistente, oferta compatível, mesmo pagamento, novo embarque |
| Duas versões/moderação | Suporte vinculado à corrida, retrato persistido (migração 095) | Parcial | Complementar atendimento existente, sem outro suporte |
| Bônus monetário por ocorrência | Benefícios existentes são pontos; não equivalem a este adicional | Pendente | Política própria desligada, integração ao cálculo e ledger existentes |
| Seis corridas dos prints | IDs parciais DEFF08F0 e 3603B4F3 | Não verificado | Consultar dados reais somente leitura; nunca conciliar em lote por suposição |
| VPS/Web/Android/iOS atualmente instalados | Sem acesso autenticado ao servidor/aparelhos nesta sessão | Não verificado | Não declarar publicação nem homologação física |

## Sequência autorizada

1. Corrigir coerência do estado e atualização das telas, sem ativar políticas.
2. Preservar autoria/histórico através do reembolso; testes de Pix tardio.
3. Ampliar embarque aditivamente para atribuições sucessivas, sem alterar 3 dígitos/5 tentativas.
4. Ocorrências Pix/dinheiro e substituição, reutilizando suporte e matching; controlar por política desligada.
5. Adicional monetário, cálculo autoritativo e liquidação única; controle independente desligado.
6. Interfaces, regressão e compilação Web/Android/iOS; nenhuma publicação.

## Decisão posterior confirmada pelo responsável

A destinação usa o método da **próxima corrida**: em dinheiro, o motorista que a realiza recebe o adicional; em Pix, recebe o motorista prejudicado na ocorrência anterior. O motorista da nova corrida Pix visualiza somente a tarifa normal e seus ganhos. O passageiro conhece o total e pode abrir o detalhamento antes de confirmar. Comissão habitual sobre tarifa normal, zero comissão sobre adicional. Crédito definitivo só após conclusão e confirmação do pagamento aplicável. Crédito no extrato não é transferência bancária automática. Não presumir suporte a cartão/carteira para este adicional.

## Limites e riscos

O caminho real do caso dos prints ainda depende de vincular IDs completos e estados persistidos na VPS. Corrigir um caminho comprovado no código não prova a causa de todos os registros antigos. Não mudar dados históricos, configurações reais, dinheiro habilitado, credenciais ou políticas. Testes simulados não provam recebimento/reembolso/repasse real.

O primeiro teste local do Core via CLI tsx parou antes de executar testes por EPERM no socket IPC; deve-se usar o carregador Node ou CI. Typecheck passou. Os 177 testes do ADM passaram na base. Flutter/PostgreSQL ainda precisam de ambientes próprios; não declarar plataformas aprovadas antes dos resultados.

## Execução da primeira correção

PR #72 criado como DRAFT, base #71. Nenhum merge/deploy/ativação.

Correções presentes: cancelamento explícito de reserva pelo motorista, reconsulta de Atividades com aba fechada, preservação da autoria durante estorno, identificação de suporte versus passageiro, recuperação de terminal sem checkout, não devolver QR Pix pendente de corrida encerrada e conciliação de Pix tardio sem reativação. Dinheiro cancelado não afirma que houve ou não entrega física.

O relatório `deploy/staging/inspect-ride-consistency.mjs` consulta exclusivamente versões, políticas, migrações e até 30 registros relacionados aos IDs dos prints, em transação PostgreSQL REPEATABLE READ READ ONLY. Omite nomes, telefones, documentos, PINs, QR codes e credenciais. Sua execução pelo responsável continua necessária para confirmar o cenário real antes de decidir qualquer conciliação histórica. Não foi executado na VPS nesta sessão.

A regra de bônus foi aprovada e está registrada acima; **ainda não estava implementada no primeiro checkpoint**. O ledger atual exige tarifa = comissão + líquido de um único motorista, e classifica excesso como recuperação de custo de pagamento. A próxima integração precisa separar o adicional e o beneficiário, mantendo liquidação atômica e bloqueando a dupla compensação com a taxa antiga. Esse limite descrevia somente o primeiro checkpoint; a integração posterior está registrada abaixo.


## Evidência recebida da VPS (consulta do responsável)

O gateway serve `/opt/ramo-nessa-web/releases/driver-cinema-d8ddfb102f88/bundles`; banco até migração 095. Core imagem `sha256:b2e1742a4811bfd9455f550612628986871d9d00d2c9ec79242e907d4c51cc4d`; gateway `sha256:afd2bf7ee10435bf192c150d048310db027f81cb3334ce5ea5038307f7ca982f`, ambos running. Imagem identifica o artefato, não comprova sozinha o commit-fonte do Core.

Embarque desativado (revisão 0); cancelamento manual desativado (revisão 4). Existem taxas configuradas por categoria, mas o interruptor geral está desligado. Dinheiro, Pix e carteira habilitados; cartão desativado. Nenhuma dessas configurações foi alterada.

As referências dos prints DEFF08F0 e 3603B4F3 possuem estado AWAITING_PAYMENT, payment_status created, método nulo, nenhum motorista e nenhum registro de pagamento. Os prazos venceram. A mesma conta tem outras quatro tentativas equivalentes (01A12E9F, EA983590, 3857BC69, EBD88B5A), explicando as seis atividades. Cancelamentos reais em dinheiro, como 6D007B2F, 502ABCF5, 3E93FBED, F16E0661 e F53448FD, estão em CANCELLED_BY_DRIVER, cash/authorized e sem pagamento digital. Portanto, não há evidência de que os IDs dos prints sejam as corridas efetivamente canceladas: a principal causa do aviso observado é a classificação de tentativas vencidas como ativas.

Correção adicionada: modelo de leitura EXPIRED para tentativa sem motorista, sem método e sem pagamento registrado, com prazo válido já vencido. Atividades mostra Solicitação expirada no Histórico; retomada explícita abre detalhes sem cobrança. Não altera o estado persistido nem fabrica autoria de cancelamento. Pagamento existente (inclusive Pix pendente), estado confirmado, motorista atribuído ou prazo inválido impedem essa classificação automática. Não há limpeza em lote ou decisão financeira.

A compilação dos quatro alvos nativos na primeira revisão terminou, mas o job falhou na conferência final porque Flutter retirou duas linhas vazias finais de cada pubspec.lock. Normalizados somente esses finais de arquivo, sem mudança de versão, hash ou dependência. Nova execução ainda deve ser conferida antes de declarar aprovação final.


## Integração posterior no PR #72

Os commits remotos 9e0a5326 e fb636e26 complementam a base preservada. O segundo recebeu aprovação nos dez jobs da execução https://github.com/iansilva23/ramo-nessa/actions/runs/40220847191: Core/PostgreSQL, ADM, shared UI, aplicativos Web e seus testes Chromium/WebKit, controles ADM nos dois motores e quatro compilações nativas (Android e simulador iOS de Passageiro/Motorista). Compilação e testes automatizados não equivalem a homologação em aparelhos nem a operações financeiras reais.

Implementado: ocorrência persistente ligada ao atendimento existente; duas versões; dinheiro com confirmação de recebimento e devolução física; interrupção Pix, devolução pelo caminho financeiro existente, escolha de substituição na mesma corrida/pagamento/destino; busca por menor ETA verificado e aceite existente de 35 segundos; novo código de três dígitos com cinco tentativas, histórico e bloqueio; moderação com decisão financeira explícita e adicional futuro separado. Falha de GPS/rotas não inventa um ponto de encontro nem ETA: permite devolução e suporte. Nenhum primeiro motorista recebe pela interrupção mecânica.

O bônus usa a próxima corrida elegível: dinheiro fica com o próximo motorista, Pix credita o motorista prejudicado no ledger existente. Não há fundo novo nem transferência bancária improvisada. Comissão normal sobre tarifa normal; zero sobre bônus. Reserva concorrente única, liquidação idempotente, consumo na transação financeira e revisão quando uma corrida já compensada é reembolsada. Taxa antiga já creditada impede compensação duplicada. Cartão/carteira não recebem operações de bônus não suportadas.

A, B e C permanecem independentes: embarque existente, novas ocorrências e adicional futuro. Migração 097 cria B/C desativados, não altera a configuração A nem os pagamentos existentes. Cada nova corrida recebe regras persistidas; alternar controles não muda regras de corridas anteriores. Alterações são aditivas, sem apagar migrações ou reescrever dados históricos. A migração 096 mantém a autoria do cancelamento e a apresentação EXPIRED é somente leitura.

Último complemento: sincronizar a conclusão da ocorrência com o mesmo atendimento de suporte, preservar ocupação do motorista se ele já estiver em outra corrida e restringir relatos de cada motorista aos próprios atendimentos. Esse complemento foi validado pela execução final indicada abaixo.

### Arquivos e revisão

O diff completo do PR é a relação autoritativa de arquivos. Principais grupos: migrações 096/097; ride-occurrence-store/routes, occurrence-bonus; repositórios de corridas e matching; settlement/ledger e ambos os repositórios financeiros; server.ts; telas/serviços/modelos de Passageiro e Motorista; painel compartilhado design_system; módulo de ocorrências ADM; testes PostgreSQL, financeiros, widgets e navegadores. O visual/câmera aprovado da base #71 foi preservado; os cartões só recebem informação adicional quando há bônus ou ocorrência ativa.

### Pendências de homologação e operação

Não houve merge, publicação, alteração da VPS ou ativação. A evidência recebida da VPS continua mostrando migração 095 e artefatos anteriores; versões nativas instaladas não foram verificadas. Pendem homologação presencial em Android/iPhone, GPS/rede reais, confirmação de devolução/repasse com os provedores e revisão operacional antes de eventual publicação autorizada. Não foi criado instalador novo nem executado instalador antigo. As revisões #69/#70 e as demais branches permanecem intactas.


## Resultado final automatizado

Código remoto 3c5fa5e5ab635fac7654895d5a4bd6909cd6360a: todos os dez jobs aprovados na execução https://github.com/iansilva23/ramo-nessa/actions/runs/40232751441. Inclui o último complemento do suporte e do acesso aos relatos. As alterações posteriores a esse código são exclusivamente este registro documental; não modificam código, migrações ou configurações.

Commits da integração nova: 9e0a5326 (ocorrências/substituição/bônus), fb636e26 (testes e liquidação atômica) e 3c5fa5e5 (sincronização do suporte e escopo dos relatos). O histórico completo e todos os 72 arquivos da revisão estão no PR #72. Não há conflito de merge informado pelo GitHub; não foi realizado merge. As limitações de homologação física e financeira e o estado não publicado continuam válidos.
