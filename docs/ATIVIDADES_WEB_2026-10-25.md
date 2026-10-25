# Atividades e retomada de corridas — web

## Comportamento

Passageiro e motorista têm a corrida atual em Atividades, separada do histórico. O passageiro volta à tela inicial ao reabrir, mesmo com Pix pendente, e escolhe Acompanhar ou Ver pagamento. A consulta abre a corrida selecionada e reutiliza o pagamento existente. Sair da tela de acompanhamento não cancela a viagem nem a reserva recuperada.

O motorista retoma a atribuição persistida mesmo quando os indicadores online/busy estão desatualizados. Uma corrida concluída mais recente não esconde uma atribuição em andamento. Retomar não marca chegada, não inicia trajeto e não conclui a corrida. O início exige confirmação de embarque; o código de embarque continua obedecendo à política existente, inicialmente desativada.

Atualizações HTTP periódicas complementam a conexão em tempo real do motorista. Uma falha preserva o último registro visível, sem interpretar indisponibilidade como encerramento. Uma resposta antiga não deve substituir mudança de corrida/etapa recebida durante a consulta. A localização pode continuar sendo enviada para a viagem ativa mesmo com a disponibilidade offline; isso não torna o motorista disponível para novas ofertas.

## Moderação

Ajuda abre um pedido ligado ao ID da corrida, para ambos os participantes. O servidor valida a participação e monta o contexto: participantes, veículo, percurso, valor, pagamento e etapas disponíveis. O cliente não fornece os registros de evidência.

A migração 095 cria um registro transacional das mudanças de estado, pagamento e atribuição. Cada evento guarda o horário de registro no servidor e o último GPS conhecido do motorista com seu próprio horário de observação. Repetir uma gravação sem mudança não duplica a etapa. A precisão do GPS ainda não é coletada pelo fluxo atual; permanece desconhecida, sem estimativa inventada.

O contexto anexado ao atendimento é um retrato persistido. Mudanças posteriores na corrida ou no GPS não reescrevem o retrato. O ADM mostra os registros como texto, incluindo horários e limites da evidência. O acesso comum ao atendimento retorna o vínculo com a corrida e as respostas; o contexto administrativo não é devolvido aos aplicativos.

Não se reconstrói chegada ou trajeto de corridas antigas. Chegada informada e GPS isolado não comprovam presença física. Um ponto antigo não pode ser interpretado como posição ao vivo.

## Escopo e instalação

Somente Passageiro web, Motorista web, ADM e Core. Sem publicação ou build Android/iOS, sem instalação na VPS e sem chamadas reais aos provedores de pagamento. A versão restaurada pelo responsável continua sendo a versão em uso.

O PR depende da base do PR #61. Não reutilizar o instalador do PR #62: ele contém o comportamento anterior de recuperação forçada. Uma atualização futura exige pacote próprio, validação integrada, revisão de migrações presentes e novo ensaio de retorno.

## Validação

Validação em andamento nesta branch. Inclui testes de navegação sem checkout automático, retomada do ID exato, consulta somente por leitura do pagamento, layout a 320 px, confirmação de embarque, atendimento dos dois papéis, isolamento de contas, evidência persistida e renderização segura no ADM. O workflow desta entrega executa PostgreSQL, as duas aplicações e os componentes compartilhados.
