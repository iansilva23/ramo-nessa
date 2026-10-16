# Problemas, marketing e benefícios pessoais

A implementação acrescenta três áreas: **Problemas & Recomendações** e **Central de Marketing** no ADM; **Meus benefícios** no perfil do passageiro. Nenhuma campanha é criada ou enviada na migração. O controle geral, os novos rascunhos e o consentimento dos clientes começam desligados.

## Colocação em funcionamento

1. Aplicar `081_growth_center.sql` pelo migrador normal do Core e publicar o Core/ADM da mesma revisão. A consulta de cupons passou a depender das duas colunas novas; aplicar a migração antes de iniciar o backend atualizado.
2. Validar PostgreSQL, ADM e Flutter pelo workflow `Growth Center Review`, que chama o Preflight existente. Compilar e testar o aplicativo em aparelho antes de distribuir. A tela de benefícios precisa da nova versão do app.
3. No ADM Equipe, atribuir `issues:read/write` e `marketing:read/write` conforme a função. Ativar ou executar exige **marketing:send**; configurar presentes exige **finance:write**. A migração não concede permissão de envio automaticamente.
4. Configurar somente os canais necessários. Sem configuração, e-mail/WhatsApp/push ficam indisponíveis. O canal dentro do app funciona sem provedor externo.
5. Criar um rascunho para **Preá / moto**, com orçamento e destinatários pequenos, validade definida, disponibilidade exigida e grupo de comparação. Consultar a prévia. Ela mostra elegíveis e motivos de exclusão sem enviar.
6. Em homologação, usar contas de teste que optaram pelos canais; conferir recibos no provedor, retirada de consentimento, cupom pessoal e remuneração original do motorista. Depois, habilitar conscientemente a campanha e o controle geral.

Não há publicação, migração de produção ou disparo real feito por este conjunto de alterações.

## Canais externos

Push reutiliza o provedor FCM existente. Notificação com `screen=benefits` contém o identificador da mensagem; o usuário acessa os benefícios pelo perfil. Navegação automática ao tocar a notificação não foi adicionada.

E-mail utiliza Resend, com domínio/remetente verificado:

- `MARKETING_EMAIL_PROVIDER=resend`
- `MARKETING_EMAIL_API_KEY`
- `MARKETING_EMAIL_FROM`
- `MARKETING_PUBLIC_BASE_URL`: origem HTTPS pública do Core, servindo `/v1/marketing/unsubscribe`
- `MARKETING_UNSUBSCRIBE_SECRET`: segredo privado de pelo menos 32 caracteres, persistido entre reinícios

WhatsApp utiliza a API oficial da Meta, independente do provedor de OTP:

- `MARKETING_WHATSAPP_ACCESS_TOKEN`
- `MARKETING_WHATSAPP_PHONE_NUMBER_ID`
- `MARKETING_WHATSAPP_API_VERSION`: versão válida para a conta, explicitamente configurada
- `MARKETING_WHATSAPP_TEMPLATE`: modelo de marketing aprovado em `pt_BR`, com três parâmetros de corpo: título, mensagem e link de descadastro
- `MARKETING_WHATSAPP_TEMPLATE_APPROVED=true`
- A mesma origem HTTPS e o mesmo segredo de descadastro acima

Guardar segredos no ambiente privado do serviço; não no repositório ou ADM. Os arquivos de deploy existentes não foram alterados para injetar essas variáveis: configurar o ambiente do Core conforme a infraestrutura. O cliente deve autorizar WhatsApp especificamente. O link desativa somente aquele canal: GET mostra confirmação, POST efetiva. Não foi implementado webhook de respostas “PARAR”; não anunciar esse recurso.

## Regras verificáveis

- Aniversário é opcional: guarda somente dia e mês. 29/02 é observado em 28/02 nos anos sem esse dia.
- Regras para calendário, primeira corrida, fidelidade, inatividade, cadastro sem corrida, pedido sem motorista, pagamento pendente, benefício próximo de vencer, indicação e chamado resolvido.
- Conta suspensa, corrida ativa ou chamado aberto bloqueiam campanhas. Região declarada pelo cliente ou da corrida mais recente; não inferir residência ou turismo por localização.
- Oferta de motoristas considera localização atual, categoria e aprovação operacional. Não garante aceite ou tempo de chegada.
- Silêncio padrão: 21h às 8h em Fortaleza. Limite padrão: **dois canais em sete dias somando campanhas**. Canais excedentes são cortados na ordem configurada; sem saldo no limite, o cliente fica excluído.
- Automação consulta a cada 15 minutos e usa lotes de até 100. Cada campanha/cliente/ocasião tem reserva única; reserva e limite são serializados no PostgreSQL antes de chamar provedores.
- Orçamento reserva o valor máximo do presente e os custos declarados por canal. Não é custo realizado nem lucro. Reservas não são liberadas automaticamente após falha ou exclusão de dados; isso evita ultrapassar o teto depois de um resultado incerto. Limites não podem ser editados abaixo das reservas existentes.
- Provedor aceitou não significa que o cliente leu. Resultado incerto não é reenviado automaticamente. Novas preferências, desligamento e edição são conferidos antes dos canais seguintes.
- Presente é desconto fixo pessoal, uma utilização, validade/categorias/regiões definidas, custeado pela empresa pelo mecanismo financeiro já existente. O valor original do motorista permanece preservado.
- Indicação não permite autoindicação, mesma conta/telefone ou segundo cadastro de indicação. Recompensa depende de campanha ativa e primeira corrida paga concluída iniciada após o registro. Não é um sistema completo de detecção de fraude.
- Exclusão/anônimização de marketing remove preferências, mensagens e indicação; conserva reservas anônimas para o controle financeiro e desativa presentes. O atendimento de outros dados pessoais segue os fluxos existentes de privacidade.

## O que os painéis conseguem medir

Problemas mostra evidências de corridas, reembolsos, pagamentos, falta de motorista, recusas de ofertas, corridas sem evolução, suporte e falhas de comunicação. Permite responsável, status, notas e histórico. Recomendações exigem avaliação humana; não cancelam corridas, suspendem serviços nem alteram preços automaticamente.

Cobertura declarada: até 200 corridas recentes de sete dias, 200 ativas, ofertas das últimas 50 consultadas e 100 chamados. Motivo “sem motorista” usa estado atual e pode desaparecer depois do reembolso. Histórico fora da amostra não prova resolução. Instrumentação histórica do motivo ainda precisa ser ampliada.

Instalações sem pedido, abandono anterior à criação da corrida, anúncios externos e incidentes de segurança não são medidos automaticamente nesta revisão. O painel informa essa ausência. Para medir custo de aquisição, registrar canal/origem, investimento e eventos de funil em uma etapa posterior; não confundir conversão de campanha com resultado de anúncios.

Marketing apresenta contatados, grupo de comparação, aberturas registradas dentro do app, reservas e conversões em 14 dias. Até 50 corridas recentes por cliente; comissão bruta não é retorno incremental nem lucro. E-mail/WhatsApp não têm recibos de leitura integrados. Não há comprovação automática de que uma mensagem causou a corrida.

O processamento bloqueia envios quando a consulta ultrapassa 1.000 clientes ou o histórico consultado ultrapassa 10.000 entregas, evitando resultados silenciosamente incompletos. Antes de expandir além do piloto, implementar consultas segmentadas e paginação de entregas/relatórios.

## Piloto no Preá

Começar com uma campanha, região Preá e categoria moto; oferecer benefício somente com orçamento definido. Dar preferência ao canal dentro do app ou push consentido e exigir disponibilidade. Comparar com grupo sem contato após 14 dias, avaliar atendimento e custos reais antes de ampliar divulgação ou abrir Jeri. Aniversário e datas comemorativas podem ser preparados como rascunhos separados, mantendo o teto global de contatos.

## Painéis simplificados e automações prontas

A Central mostra cartões prontos para aniversário, Natal, Ano-Novo, Dia do Cliente, Dia do Trabalhador, São João e inatividade. **Ativar automático** cria um rascunho, ativa a campanha e liga o controle geral, reutilizando uma campanha existente de mesmo nome/regra/data. Nenhum envio acontece simplesmente ao abrir a tela. Permissões de escrita e envio continuam obrigatórias. Os cartões começam com mensagem pronta, sem cupom/custo declarado, Preá, app e push quando configurado, sem grupo de comparação. Campanhas próprias continuam disponíveis no editor recolhido.

Aniversário e datas fixas podem repetir anualmente: `repeatAnnually` ignora apenas o término da vigência, preservando início, orçamento total, máximo total de destinatários, consentimento, silêncio, disponibilidade quando exigida e unicidade por ano. Limites **não** são renovados automaticamente; o painel sinaliza quando precisam ser ampliados. Clientes sem aniversário informado não recebem a campanha de aniversário. Datas móveis não são calculadas por estes modelos. Inatividade pronta tem vigência de dez anos e exige motorista disponível. Mensagens de felicitação não exigem disponibilidade.

O editor permite acrescentar cupom e orçamento antes de ativar. Os gráficos usam contagens reais: prioridade dos problemas, contatos por campanha, aberturas no app e comparação. O relatório detalhado mostra conversões observadas. Não há série temporal inventada. Problemas abrem detalhes, recomendações e acompanhamento ao clicar; histórico e limitações ficam recolhidos.
