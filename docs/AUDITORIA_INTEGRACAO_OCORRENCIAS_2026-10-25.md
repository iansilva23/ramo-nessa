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

A regra de bônus foi aprovada e está registrada acima; **não está implementada nem ativada nesta primeira correção**. O ledger atual exige tarifa = comissão + líquido de um único motorista, e classifica excesso como recuperação de custo de pagamento. A próxima integração precisa separar o adicional e o beneficiário, mantendo liquidação atômica e bloqueando a dupla compensação com a taxa antiga. Não apresentar este PR como entrega de substituição, ocorrências completas ou bônus operacional.
