# Ranking & Benefícios

O módulo nasce desligado e cada campanha nasce em rascunho. A ativação global
controla a visibilidade no app; não apaga campanhas, atividade ou resultados.
Cada campanha pertence a uma categoria e tem período, regiões, seleção,
exclusões, pontuação, missões, Top N e mínimo de participantes próprios.

## Pontuação e território

- `ride`: origem **ou** destino deve corresponder à zona/localidade configurada.
  Numa campanha territorial, o participante precisa ter atividade elegível no
  período. Motoristas que só operam em outro território não liberam a premiação.
- `driver_base`: a base deve corresponder à região; corridas da categoria podem
  ocorrer em outras regiões.
- `both`: exige a base correspondente e filtra cada corrida pelo território.
- Sem regiões selecionadas, a campanha abrange toda a operação.
- Seleção explícita e exclusões nunca dispensam aprovação de perfil/veículo
  ou habilitação na categoria. Exclusão prevalece sobre seleção.

Pontos vêm de corridas concluídas, avaliações 5/4 estrelas, qualidade e missões.
Cancelamentos atribuíveis ao motorista entram no indicador de qualidade.
O desempate usa pontos, corridas, média de avaliação e ID em ordem determinística.
Não há incentivo por velocidade ou horas conectado.

A migration 071 registra fatos de conclusão/cancelamento na mesma transação
da atualização da corrida. O fato mantém sua data mesmo se `rides.updated_at`
mudar; cancelamento seguido de estorno continua contando. Avaliações recebidas
depois do encerramento não alteram a classificação.

O backfill recupera somente fatos comprováveis pelo estado anterior do banco.
Cancelamentos já estornados antes da migration não têm data histórica
recuperável no schema anterior; não são reconstruídos com datas inventadas.

## Ciclo e histórico

Campanha agendada aparece como ativa somente dentro do período. Pausar oculta
a campanha do app e preserva os dados; o cálculo continua definido pelo período
configurado quando a campanha é retomada. Não se introduziu uma nova regra de
exclusão das corridas durante a pausa.

Após iniciar, pontuação, categoria, período, território e participação ficam
protegidos. O operador pode ajustar nome e descrições dos prêmios. Novas regras
exigem outra campanha. Uma campanha iniciada não volta a rascunho; uma encerrada
não é reaberta nem editada.

PATCH de campanha/status exige `expectedUpdatedAt`. O banco compara a revisão
atomicamente; conflito retorna HTTP 409 e exige atualizar a página. O ADM envia
a revisão que o operador abriu, preservando IDs de missão e datas originais
quando esses campos não foram alterados.

Encerramento manual consolida o resultado e limita atividade à sua data efetiva.
Fim automático consolida na próxima consulta/verificação do Core, executada
a cada 60 segundos e também na inicialização, mesmo com visibilidade global OFF.
O resultado persistido mantém participantes, nomes e estatísticas apesar de
alterações posteriores de perfil, aprovação, categoria ou base. Durante uma
interrupção do Core, a consolidação automática ocorre ao retomá-lo.

Histórico mostra até seis campanhas recentes em que o motorista participou.
Vencedores respeitam Top N e só são anunciados quando o mínimo foi atingido.
O ranking ativo pode existir antes de liberar a premiação, com aviso explícito.

## Segurança e premiação

Endpoints administrativos validam `drivers:benefits:read/write` no Core.
O endpoint do app usa a identidade da sessão e expõe apenas nomes abreviados,
estatísticas e identificação visual da própria posição. Não retorna IDs de
outros motoristas, CPF, telefone, e-mail, placa, endereço ou chave Pix.

Prêmios são exclusivamente descrições. “R$ 500 via Pix” não cria pagamento,
payout, saldo, crédito, comissão, extrato ou lançamento financeiro. Não existe
integração com FinanceRepository, Mercado Pago ou carteira. O proprietário
realiza eventual pagamento manualmente fora deste módulo.

## App Motorista

A entrada existente no Perfil utiliza a capacidade `DriverBenefitsApi` do
mesmo `HttpDriverApi`: cliente HTTP, Bearer, identidade dev autorizada e timeout
continuam compartilhados. Não existe uma segunda sessão. A tela aceita injeção
para testes e mantém a prévia original quando não há API no Preview, o módulo
está OFF ou não há campanha ativa elegível.

Campanhas reais mostram seleção, tempo restante, posição própria, pontos,
diferença para a posição anterior, pódio, Top 20 + posição própria, corridas,
avaliação, detalhamento, missões com progresso, prêmios informativos e mínimo de
participantes. Empate em pontos explica os demais critérios. O histórico também
fica disponível quando não há campanha ativa, desde que o módulo esteja ON.

Há atualização manual, atualização a cada minuto enquanto o app está ativo e
nova consulta ao retornar do background. Erro de rede tem mensagem e tentativa
novamente; não é convertido em “Em breve”. Uma atualização remove dados antigos
até concluir a consulta. Respostas anteriores não sobrescrevem uma sessão/tela
nova. Layout usa largura limitada, adaptação do pódio a telas pequenas e fontes
ampliadas, além de labels acessíveis para controles e progresso.

O Preflight conserva PNGs dos testes visuais em `driver-benefits-visuals` para
verificação de layout. Esses testes usam dados de fixture; o Test Stack Audit
verifica separadamente gateway, autenticação real, scopes, banco e auditoria.
