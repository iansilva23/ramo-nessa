// This guide describes the managed ADM, not the old publication screens.
// Keep sources alongside each chapter so changes to behavior can be reviewed.
const section = (title, paragraphs = [], rows = [], steps = []) => ({title, paragraphs, rows, steps});
const chapter = (id, group, title, summary, keywords, sources, sections, related) =>
  ({id, group, title, summary, keywords, sources, sections, related});

export const pricingGuide = [
  chapter('start', 'Comece aqui', 'Como organizar sua operação',
    'Entenda a ligação entre região, categoria, tarifa e motorista antes de cadastrar.',
    'tutorial ajuda manual primeiro cadastro localidade começar funcionamento',
    ['apps/admin/src/regions-pricing-admin.js', 'backend/core/src/pricing/managed-operations.ts'], [
      section('O que cada parte representa', [
        'Região é um lugar de atendimento delimitado por um círculo no mapa. Localidade, neste painel, é esse lugar cadastrado: por exemplo, uma vila, uma sede ou um ponto específico. Município e estado identificam o endereço administrativo; não desenham a cobertura automaticamente.',
        'Categoria é o serviço oferecido, como Mototáxi ou Buggy. Tarifa é a regra que define quanto cobrar de uma categoria entre duas regiões, em um período. Motorista compatível é quem pode realmente realizar o serviço. Essas quatro partes precisam estar coerentes.',
        'Salvar uma região ou ligar uma categoria não cria preços e não cadastra motoristas. Não há preço comercial automático. Sem regra válida, a opção fica indisponível. A simulação do preço também não garante que haverá motorista disponível.'
      ], [
        ['Regiões', 'Cadastrar lugares, posicionar coberturas e escolher categorias atendidas.'],
        ['Categorias', 'Organizar nome, descrição, ícone, capacidade e requisitos dos serviços.'],
        ['Tarifas e rotas', 'Definir preço fixo ou por km para origem, destino, categoria e horário; simular valores.'],
        ['Configurações', 'Definir a divisão entre dia e noite e consultar o histórico de alterações.']
      ]),
      section('Ordem recomendada', [], [], [
        'Confira as regiões e seus círculos. Jericoacoara e Jijoca (sede) pertencem a Jijoca de Jericoacoara; Preá pertence a Cruz, no Ceará.',
        'Confira a categoria existente que realizará o serviço e sua capacidade. Prefira editar o serviço compatível já existente.',
        'Selecione essa categoria na origem e no destino. As duas regiões e a categoria precisam estar ativas.',
        'Cadastre a tarifa com os valores comerciais que você decidiu. Configure somente os períodos em que quer atender.',
        'Use Simular corrida e confira categoria, passageiros, ida/volta e dia/noite. Depois valide o fluxo completo no Passageiro Web e Motorista Web com motorista compatível.'
      ]),
      section('Como consultar este manual', [
        'Use a busca para encontrar campos, tarefas ou mensagens. A busca considera títulos e o conteúdo dos capítulos, ignora acentos e aceita várias palavras. Apague o texto para voltar ao índice completo.',
        'Os botões de ajuda junto aos campos e os botões Como funciona? abrem o capítulo relacionado. Ao fechar a ajuda, seu formulário continua aberto com os dados que estava preenchendo. Abrir, pesquisar ou ler o manual não salva configurações nem executa cobranças.',
        'Este manual cobre Regiões e preços. Pagamentos, repasses, cadastro documental de motoristas e outros módulos têm controles próprios. A fase atual prioriza ADM e aplicativos Web; o aceite e a sincronização dos aplicativos nativos são etapas separadas.'
      ])
    ], ['region', 'category', 'rate', 'availability']),

  chapter('region', 'Regiões', 'Cadastrar e editar uma localidade',
    'Percorra os quatro passos do assistente e saiba o que será salvo.',
    'adicionar região localidade editar nome município estado operação confirmar continuar voltar salvar',
    ['apps/admin/src/regions-pricing-admin.js', 'backend/core/src/pricing/management-service.ts'], [
      section('Onde começar', ['Na aba Regiões, clique em Adicionar região. Para alterar uma existente, clique em Editar no card ou selecione sua cobertura no mapa. O assistente tem Localização, Operação, Tarifas e Confirmar.']),
      section('Passo 1 — Localização', [], [
        ['Nome da região', 'Obrigatório, até 100 caracteres após retirar espaços nas pontas. Use um nome reconhecível, como o nome da localidade. Não é uma tarifa.'],
        ['Pesquisar no mapa', 'Busca opcional de 3 a 160 caracteres. Informe localidade, município e estado para reduzir ambiguidades. Clique em Buscar e depois no resultado correto.'],
        ['Latitude e Longitude', 'Abaixo da pesquisa, permitem posicionar o centro por coordenadas em graus decimais. Aceitam sinal negativo, zero, ponto ou vírgula decimal. Use Posicionar no mapa ou Continuar para conferir o par digitado.'],
        ['Município', 'Obrigatório, até 100 caracteres. As sugestões ajudam a digitar; não substituem sua conferência. Selecionar um resultado no mapa não preenche automaticamente município e estado.'],
        ['Estado', 'Selecione a UF correta. A seleção inicial é CE; confira antes de salvar.'],
        ['Raio de cobertura (km)', 'Obrigatório, de 0,05 a 100 km. O campo usa incrementos de 0,05 km. 0,05 km equivale a 50 metros.'],
        ['Ponto no mapa', 'Em uma região nova, clique no mapa, escolha um resultado ou aplique Latitude e Longitude para confirmar o centro. O ponto inicial de visualização do mapa não conta como sua seleção.']
      ]),
      section('Passo 2 — Operação', [
        'Marque as categorias permitidas nessa região. Selecionar aqui não ativa uma categoria desativada e não implementa suporte para um tipo novo. Região ativa permite seu uso em novas operações quando os demais requisitos estiverem válidos.',
        'Ao retirar uma categoria de uma região ou desativar a região, as tarifas relacionadas que perderem essa permissão são desativadas na mesma alteração. Ao reativar a região ou selecionar a categoria novamente, revise e reative as tarifas separadamente.'
      ]),
      section('Passo 3 — Tarifas', [
        'Definir uma tarifa agora é opcional. Desmarcado, salva somente a região; tarifas já existentes de uma região editada não são apagadas por isso. Uma região nova sem tarifa não gera preço.',
        'Marcado, permite cadastrar uma tarifa junto com a região. A origem ou o destino dessa tarifa deve ser a região do assistente; a categoria deve estar habilitada nas duas pontas. Essa tarifa usa as mesmas validações do cadastro em Tarifas e rotas.'
      ]),
      section('Passo 4 — Confirmar e salvar', [
        'Confira nome, município, estado, raio, categorias e preços apresentados. Voltar permite corrigir os passos anteriores. Continuar apenas avança: a alteração só é enviada em Salvar região.',
        'O resumo não substitui a revisão dos campos detalhados de passageiros e adicionais. Se cadastrou uma tarifa, revise esses campos antes da confirmação. Salvar região grava região e tarifa incluída em conjunto; uma validação inválida impede a operação completa.',
        'Editar uma região que já estava ativa exige confirmação com senha e novo MFA. Fechar antes de salvar descarta apenas as mudanças ainda não enviadas; não desfaz uma alteração já confirmada.'
      ])
    ], ['map', 'overlap', 'region-status', 'security']),

  chapter('map', 'Regiões', 'Mapa, alfinete e raio de cobertura',
    'Entenda a diferença entre mover o mapa, mudar o centro e aumentar a área atendida.',
    'coordenadas latitude longitude GPS cobertura círculo raio zoom alfinete borda arrastar pesquisa ponto pin',
    ['apps/admin/src/pricing-geofence-map.js', 'backend/core/src/pricing/managed-operations.ts'], [
      section('Como operar o mapa', [], [
        ['Alfinete', 'Marca o centro. Arraste para mudar a posição da região. Confira as coordenadas mostradas em Ponto selecionado.'],
        ['Círculo e ajuste na borda', 'O círculo mostra a cobertura. Arraste o controle da borda para ampliar/reduzir; o raio numérico acompanha a alteração.'],
        ['Campo de raio', 'É a alternativa precisa ao arraste. Alterar o número atualiza a cobertura, dentro de 0,05 a 100 km.'],
        ['Botões + e −', 'Aproximam ou afastam a visualização. Zoom não muda o raio nem o preço.'],
        ['Fundo do mapa', 'Arrastar o fundo desloca a visualização. Clicar para selecionar um ponto altera o centro; confira o alfinete antes de continuar.'],
        ['Teclado', 'Com o alfinete em foco, as setas movem o centro. No controle de raio, direita/cima aumentam e esquerda/baixo diminuem em 0,05 km. Tab permite alcançar os controles.']
      ]),
      section('Digitar Latitude e Longitude', [
        'Os dois campos ficam logo abaixo de Pesquisar no mapa. Latitude é a posição norte/sul; longitude é leste/oeste. Use graus decimais e mantenha a ordem dos campos. Para posições da região de Jeri/Preá, os dois números normalmente têm sinal negativo.',
        'Cole ou digite somente o número em cada campo. Aceita ponto ou vírgula decimal e espaços nas pontas. Não aceita coordenadas em graus/minutos/segundos, texto, par completo no mesmo campo, notação científica, NaN ou infinito. Latitude precisa ficar entre −85,05112878 e 85,05112878 e longitude entre −180 e 180.',
        'Posicionar no mapa valida o par inteiro, centraliza o mapa e move alfinete/círculo juntos. Enter dentro de um desses campos faz a mesma conferência, sem enviar o cadastro. Enquanto você digita, o mapa não se move a cada tecla. Continuar também aplica um par digitado válido antes de avançar.',
        'Se um valor estiver vazio ou inválido, aparece um erro e o mapa permanece no último ponto válido. Continuar não aceita avançar com coordenadas digitadas inválidas. Corrija o par ou selecione novamente um ponto no mapa.',
        'Escolher um resultado de busca, clicar no mapa ou mover o alfinete atualiza os dois campos. Ajustar apenas o raio pelo campo numérico mantém as coordenadas ainda em digitação. Selecionar um novo ponto pelo mapa ou pesquisa substitui o par que estava digitado.',
        'Os campos guardam a precisão numérica aceita pelo sistema, sem arredondar o valor para a quantidade de casas do resumo visual. Ao editar uma região, mostram as coordenadas já salvas. Posicionar o ponto não salva a região: confira município, estado, raio e categorias e conclua Salvar região.',
        'O botão de posicionar não preenche o município/estado e não calcula preço. Coordenada válida pode estar longe da sua área de operação; confira visualmente o ponto antes de salvar. O raio deve ser preenchido dentro dos limites; aplicar coordenadas não corrige silenciosamente um raio inválido.'
      ]),
      section('O que o círculo significa', [
        'Raio é a distância do centro até a borda; diâmetro é a largura inteira, equivalente a duas vezes o raio. Um raio de 1 km forma um círculo de 2 km de diâmetro. Esse exemplo é geográfico e não define preço.',
        'A cobertura é circular: não acompanha divisas de município, ruas, praia ou vias de acesso. Nome e município não limitam o círculo. Use coberturas compatíveis com sua operação e confira pontos próximos da borda.',
        'O servidor valida os pontos reais de origem e destino contra a cobertura. Digitar o nome de uma região no aplicativo não autoriza uma coordenada fora da área. GPS impreciso pode exigir reposicionar o ponto de embarque ou destino.',
        'Coordenadas precisam ser finitas e válidas: latitude entre −85,05112878 e 85,05112878; longitude entre −180 e 180. O mapa e o servidor impedem seleções fora dos limites aceitos. Coordenadas indicam posição; não são distância de rota.',
        'Para um ponto específico, como uma entrada ou estacionamento, use uma cobertura pequena, respeitando o mínimo de 50 metros. Continua sendo um círculo: qualquer ponto aceito nessa cobertura poderá ser associado à região.'
      ]),
      section('Quando a busca ou o mapa não funciona', [
        'A busca depende do serviço de lugares configurado. Se estiver indisponível, o painel informa que você pode posicionar o alfinete manualmente. Confira o nome e o endereço do resultado; locais com nomes iguais podem ficar longe da operação.',
        'O mapa de edição usa imagens do OpenStreetMap. O cálculo por km usa o provedor de rotas configurado no servidor. Ver o mapa carregado não comprova que a busca ou a rota estão disponíveis; cada serviço deve ser validado separadamente.'
      ])
    ], ['overlap', 'region', 'distance']),

  chapter('overlap', 'Regiões', 'Sobreposições e limites entre regiões',
    'Saiba como o sistema escolhe uma região quando dois círculos cobrem o mesmo ponto.',
    'sobreposição sobrepostas prioridade menor círculo empate distância borda limite fronteira',
    ['apps/admin/src/regions-pricing-model.js', 'apps/admin/src/pricing-geofence-map.js', 'backend/core/src/rides/pricing-location-validation.ts', 'backend/core/src/places/coordinate-place-policy.ts'], [
      section('Aviso de sobreposição', [
        'A sobreposição acontece quando duas coberturas ativas compartilham uma área. O painel mostra a quantidade no mapa geral e nomes das áreas envolvidas no editor. Sobreposição não é automaticamente um erro, mas precisa ser intencional.',
        'O aviso do editor mostra outros círculos ativos, sem considerar o tipo de serviço escolhido. Ele é um aviso geográfico, não uma promessa de que existe tarifa para todas as categorias nessa área.'
      ]),
      section('Ordem de escolha', [
        'Entre as coberturas que aceitam o ponto, a menor área de cobertura tem prioridade. Se os raios forem iguais, considera-se a proximidade proporcional ao centro (distância ao centro dividida pelo raio). Persistindo empate, usa-se o identificador estável da região. A ordem dos cadastros na tela não define prioridade.',
        'Por isso, um círculo menor dentro de outro pode direcionar o ponto para uma região diferente da que você esperava. Cadastre e teste tarifas da região efetivamente selecionada; não conte com o preço do círculo maior para corrigir uma configuração ausente.',
        'Origem e destino são verificados separadamente. As duas coberturas escolhidas determinam a rota tarifária. Um percurso pode atravessar outros círculos sem que esses lugares sejam origem ou destino da tarifa.'
      ]),
      section('Como conferir na prática', [], [], [
        'Revise os círculos no mapa e reduza sobreposições desnecessárias.',
        'No Passageiro Web, teste um ponto dentro da área compartilhada e outro próximo de cada borda. Confira quais regiões o aplicativo reconhece.',
        'Teste as duas direções e categorias relevantes. A simulação do ADM usa os centros e pode não reproduzir uma sobreposição que só ocorre nas bordas.',
        'Se a região escolhida estiver inesperada, revise centro e raio. Aumentar o raio apenas para conseguir preço pode ampliar indevidamente o atendimento.'
      ])
    ], ['map', 'rate', 'simulation']),

  chapter('region-status', 'Regiões', 'Cards, filtros e estados das regiões',
    'O que significam Ativa, Sem tarifas e Desativada e como localizar registros.',
    'resumo indicadores contador buscar filtro atualizar dados card status sem tarifas ativa desativada',
    ['apps/admin/src/regions-pricing-admin.js'], [
      section('Resumo e busca', [
        'Regiões ativas conta regiões habilitadas e não arquivadas. Categorias conta registros não arquivados, incluindo os desativados. Tarifas ativas conta tarifas habilitadas e não arquivadas. Esses números não representam motoristas online nem corridas disponíveis agora.',
        'Buscar região cadastrada filtra por nome ou município, sem pesquisar novos locais na internet. O filtro não altera dados. Atualizar dados busca a configuração vigente; use após uma edição feita por outro administrador ou para conferir um salvamento incerto.'
      ], [
        ['Ativa', 'A região está habilitada e tem pelo menos uma tarifa ativa relacionada. Isso não garante tarifa para toda categoria, direção ou período.'],
        ['Sem tarifas', 'A região está habilitada, mas não tem tarifa ativa relacionada. Cadastre uma regra válida para oferecer o trajeto.'],
        ['Desativada', 'A região está fora de novas operações. As tarifas afetadas são desativadas.'],
        ['Regiões arquivadas', 'Área recolhida ao final da lista para recuperar registros retirados da operação. Restaurar traz o registro desativado.']
      ]),
      section('Por que um botão pode estar bloqueado', [
        'Edição exige permissão de alterar preços e catálogo preparado para a nova gestão. Uma conta apenas de leitura pode consultar e simular, mas não alterar. Sem sessão válida será necessário entrar novamente.',
        'No estado Catálogo atual preservado, a preparação operacional ainda não foi concluída naquele ambiente. Não é uma ação de cadastro comum do administrador. Na homologação desta entrega, a ativação já foi confirmada; não repita o reset para corrigir um filtro ou preço.'
      ])
    ], ['region', 'archive', 'errors']),

  chapter('category', 'Categorias', 'Cada campo do cadastro de categoria',
    'Nome, descrição, ícone, capacidade, exigência 4x4 e ativação.',
    'criar categoria nome descrição curta ícone apresentação quantidade máxima passageiros requisitos veículos 4x4 serviço',
    ['apps/admin/src/regions-pricing-admin.js', 'backend/core/src/pricing/managed-operations.ts'], [
      section('Campos e efeitos', [], [
        ['Nome', 'Obrigatório, até 100 caracteres após retirar espaços nas pontas. Identifica o serviço. Renomear não muda seu tipo operacional interno.'],
        ['Descrição curta', 'Opcional, até 300 caracteres. Explica o serviço na apresentação suportada pela Web; não cria uma regra de preço.'],
        ['Ícone', 'Escolha uma das cinco apresentações existentes. Um ícone de moto não transforma uma categoria nova em Mototáxi nem altera a compatibilidade de veículos.'],
        ['Quantidade máxima de passageiros', 'Número inteiro entre 1 e 4. Mototáxi e Entregas têm capacidade operacional de uma pessoa; o servidor impede mudar esses dois tipos para outra capacidade.'],
        ['Exigir veículo 4x4 em trajetos de Jericoacoara', 'Define a exigência operacional para trajetos que envolvem a região principal de Jericoacoara. Não é adicional de preço. Carros nessa região precisam desse requisito; o servidor rejeita uma configuração incompatível.'],
        ['Categoria ativa', 'Autoriza a categoria suportada a participar da operação, se também houver permissão nas regiões, tarifa válida e motorista compatível. Tipo novo sem suporte não pode ser ativado.'],
        ['Salvar categoria', 'Valida e grava a definição. Alterar uma categoria anteriormente ativa exige senha e novo MFA.']
      ]),
      section('Onde escolher as regiões atendidas', [
        'A associação é feita no assistente de cada região, no passo Operação. Marque a categoria tanto na origem quanto no destino. O número de regiões no card da categoria conta as regiões ativas que a selecionaram.',
        'Desativar uma categoria desativa suas tarifas na mesma operação. Reativá-la não religa preços automaticamente. Se reduzir a capacidade para menos que os passageiros incluídos em uma tarifa ativa, ajuste a tarifa antes; a configuração inconsistente é rejeitada.'
      ]),
      section('Categorias e motoristas são cadastros diferentes', [
        'O editor não cria veículos, não aprova documentos e não coloca motoristas online. Os cadastros de frota/motoristas e as regras operacionais existentes continuam necessários. A categoria do veículo e sua elegibilidade real precisam ser compatíveis com o serviço.',
        'Preserve a categoria existente ao querer apenas trocar nome ou descrição. Excluir e recriar produz outro registro e não herda automaticamente o suporte operacional nem as associações anteriores.'
      ])
    ], ['category-support', 'region', 'availability']),

  chapter('category-support', 'Categorias', 'Por que uma categoria nova fica aguardando suporte',
    'O que já funciona e o que precisa de implementação além do cadastro.',
    'categoria nova bloqueada aguardando suporte adapter operacional veículo motorista compatível ativar serviço',
    ['backend/core/src/pricing/managed-operations.ts', 'apps/admin/src/regions-pricing-admin.js'], [
      section('Limite atual, sem atalhos', [
        'A gestão preserva os cinco tipos operacionais existentes: Mototáxi, Táxi, Buggy, Entregas e 4x4 Comfort/Black. Seus nomes podem ser editados; seu vínculo operacional interno permanece o mesmo.',
        'Adicionar categoria cria um novo registro que fica desativado, com aviso Aguardando suporte. O botão de ativar fica bloqueado e o servidor também rejeita uma tentativa de ativação sem suporte. Escolher um ícone existente não remove essa proteção.',
        'Para liberar um tipo operacional inédito, é necessário implementar e homologar o suporte no servidor, nos veículos/motoristas e nos aplicativos. Essa etapa não é resolvida apenas preenchendo o ADM. A proteção evita oferecer ao passageiro uma opção que não pode ser executada.',
        'Mesmo um dos cinco tipos suportados precisa estar habilitado nas duas regiões, com tarifa válida e motoristas compatíveis. Um preço calculável e um motorista disponível são verificações diferentes.'
      ]),
      section('O que você pode fazer sozinho agora', [], [], [
        'Editar apresentação e requisitos permitidos de uma categoria existente.',
        'Escolher suas regiões atendidas e cadastrar tarifas válidas.',
        'Desativar ou arquivar com preservação do histórico.',
        'Cadastrar a apresentação de um serviço futuro como desativado; sua liberação operacional continua dependente de implementação e homologação.'
      ])
    ], ['category', 'availability']),

  chapter('rate', 'Tarifas e rotas', 'Cadastrar uma tarifa: todos os campos',
    'Vincule regra, trajeto, categoria, períodos e adicionais sem etapas de publicação.',
    'tarifa preço rota origem destino categoria nome forma cobrança volta bidirecional dia noite ativa salvar',
    ['apps/admin/src/regions-pricing-admin.js', 'backend/core/src/pricing/managed-operations.ts'], [
      section('Antes de cadastrar', [
        'Abra Tarifas e rotas e clique em Adicionar tarifa. Ative as duas regiões, a categoria e a permissão dessa categoria em ambas. Uma tarifa ativa sem essas condições é rejeitada.',
        'Filtros Região e Categoria só mudam o que você vê na lista. O filtro de região encontra tarifas em que ela é origem ou destino. Limpar um filtro não apaga regras.'
      ]),
      section('Campos principais', [], [
        ['Nome da tarifa', 'Obrigatório, até 100 caracteres. Use um nome que ajude a localizar a regra. O nome não determina origem, destino ou preço.'],
        ['Forma de cobrança', 'Preço fixo cobra o valor do trajeto. Por quilômetro multiplica o valor unitário pela distância de rota calculada no servidor, respeitando o mínimo.'],
        ['Categoria', 'Escolha o serviço ao qual a regra pertence. Um preço de Táxi não é automaticamente usado por Mototáxi ou 4x4 Comfort/Black.'],
        ['Origem e Destino', 'São regiões cadastradas. Podem ser iguais para um deslocamento interno. Os pontos reais da corrida precisam ser reconhecidos nas coberturas correspondentes.'],
        ['Usar o mesmo preço na volta', 'Marcado, a mesma regra vale de A para B e de B para A. Desmarcado, vale só na direção cadastrada. Para volta diferente, use uma regra própria sem duplicar períodos já cobertos.'],
        ['Dia e Noite: Atender neste período', 'Marque os períodos disponíveis e informe seus valores separadamente. Uma tarifa ativa precisa de pelo menos um período com preço válido.'],
        ['Preço (R$)', 'No tipo fixo, é o preço base do trajeto. No tipo por km, é o preço de cada quilômetro. Obrigatório e maior que zero no período habilitado; até duas casas decimais.'],
        ['Valor mínimo (R$)', 'Aparece somente em Por quilômetro. É o piso do cálculo de distância daquele período, antes de passageiros extras e adicionais. Pode ser zero.'],
        ['Passageiros e adicionais', 'Abra para revisar passageiros incluídos, preço por pessoa extra e cobranças adicionais. Esses valores entram no cálculo quando configurados.'],
        ['Tarifa ativa', 'Marcada, a regra pode precificar quando todas as condições forem válidas. Desmarcada, fica guardada sem uso em novas cotações.']
      ]),
      section('Salvar e conferir', [
        'Salvar tarifa grava diretamente. Não há etapa separada de rascunho/publicação nesta área. Alterar uma tarifa anteriormente ativa exige senha e novo MFA. O servidor valida tudo antes de tornar a nova configuração vigente.',
        'O card mostra tipo, origem/destino, categoria, nome e preços por período. A seta → indica uma direção e ↔ indica ida/volta. Indisponível no preço de um período significa que aquele período está desmarcado nessa regra.',
        'Valores monetários aceitam até R$ 1.000.000,00 por campo, com no máximo duas casas decimais; o total calculado também precisa respeitar o limite técnico. Esse teto é uma validação, não uma sugestão comercial. Use apenas valores definidos por você.',
        'Duas regras ativas do mesmo tipo para a mesma rota, categoria e período não podem se sobrepor. Uma fixa e uma por km podem coexistir porque têm prioridades diferentes. Se já existe uma regra do mesmo tipo, edite a existente ou separe os períodos.'
      ])
    ], ['fixed', 'distance', 'periods', 'extras', 'errors']),

  chapter('fixed', 'Tarifas e rotas', 'Preço fixo e prioridade das regras',
    'O preço fixo válido é escolhido antes do cálculo por km, para o mesmo trajeto e período.',
    'fixa prioridade precedência fallback regra válida cobrança soma empilhar período sem tarifa',
    ['backend/core/src/pricing/managed-operations.ts', 'backend/core/src/pricing/authoritative-quote.ts'], [
      section('Sequência do cálculo', [], [], [
        'Reconhecer origem e destino nas regiões ativas e validar categoria e quantidade de passageiros.',
        'Procurar uma tarifa fixa ativa e não arquivada para a rota, categoria, direção e período solicitado.',
        'Sem fixa válida nesse período, procurar uma regra por km válida para a mesma operação e obter distância de rota no servidor.',
        'Sem nenhuma regra válida, informar indisponibilidade. O sistema não aproveita um preço legado ou de outra categoria.'
      ]),
      section('O que não se soma', [
        'Fixa e km são alternativas. Existindo fixa válida, não se soma o valor por km à fixa. Passageiros extras e adicionais da regra selecionada podem ser somados se você os configurou.',
        'A regra considera o período. Se a fixa tiver apenas dia e a regra por km tiver noite, o dia usa a fixa e a noite pode usar km. O preço diurno da fixa não é copiado para a noite.',
        'Não há busca automática de uma tarifa entre regiões diferentes nem preenchimento de lacunas por valores antigos. O deslocamento do motorista até o embarque também não gera uma cobrança legada adicional depois da cotação neste modo.'
      ]),
      section('Como testar', [
        'Simule a mesma origem, destino, categoria e período antes e depois de cadastrar a fixa. Quando a fixa for válida, ela deve prevalecer. Confira também a volta e o período sem fixa.',
        'A disponibilidade de tarifa não garante disponibilidade de motorista. A simulação administrativa calcula o preço; a busca real de motorista ocorre no fluxo da corrida.'
      ])
    ], ['rate', 'distance', 'simulation', 'availability']),

  chapter('distance', 'Tarifas e rotas', 'Preço por km, distância e mínimo',
    'Entenda a conta e por que a distância vem da rota do servidor.',
    'quilômetro kilometro km distância rota mínimo piso arredondamento Google maps linha reta',
    ['backend/core/src/pricing/managed-operations.ts', 'backend/core/src/pricing/authoritative-quote.ts'], [
      section('Como é calculado', [
        'Preço da distância = o maior valor entre (preço por km × distância da rota) e o mínimo do período. O produto é arredondado para centavos. Depois entram passageiros extras e os adicionais aplicáveis da regra.',
        'Exemplo apenas de cálculo: se a distância custar menos que o mínimo, usa-se o mínimo; se custar mais, usa-se o valor da distância. O manual não escolhe valores comerciais e não preenche nenhum campo por você.',
        'Mínimo não é um valor somado ao resultado por km. Ele é um piso. Na tarifa fixa não existe mínimo separado. O mínimo de dia e o de noite são independentes.'
      ]),
      section('De onde vem a distância', [
        'O servidor solicita uma distância de rota entre os pontos reais de embarque e destino ao provedor configurado. A distância em linha reta usada para localizar um ponto dentro de um círculo não é usada para cobrar por km.',
        'Uma distância enviada pelo navegador não autoriza cobrança. Se o provedor de rotas não estiver disponível ou não retornar uma distância aceita, a tarifa por km não pode ser calculada. Não se substitui por uma estimativa inventada.',
        'O limite técnico aceito para distância é de 0 a 5.000 km, finito; o resultado total precisa ser maior que zero. Uma distância zero sem mínimo nem adicionais que gerem total válido é rejeitada. Esses limites não ampliam sua cobertura nem criam autorização para viagens longas.'
      ]),
      section('A regra por km também tem rota', [
        'É preciso selecionar origem, destino, categoria e períodos. Uma tarifa por km para Preá → Jijoca (sede) não se torna automaticamente uma regra para qualquer lugar. Para trajeto dentro do mesmo círculo, escolha a mesma região nas duas pontas.',
        'Na simulação do ADM, os pontos são os centros das regiões. Uma simulação interna usando o mesmo centro não representa todos os deslocamentos internos possíveis. Teste também pontos reais diferentes no aplicativo.'
      ])
    ], ['fixed', 'rate', 'simulation', 'map']),

  chapter('periods', 'Tarifas e rotas', 'Horários, dia e noite',
    'Configure a divisão de períodos e os valores correspondentes em cada tarifa.',
    'horário local Fortaleza fuso início dia início noite noturno diurno 22 meia noite madrugada atender período',
    ['backend/core/src/pricing/period.ts', 'backend/core/src/pricing/management-service.ts'], [
      section('Configurações gerais dos horários', [], [
        ['Início do dia', 'Hora inteira de 0 a 23 em que começa o período diurno.'],
        ['Início da noite', 'Hora inteira de 0 a 23 em que começa o período noturno. Deve ser diferente do início do dia.'],
        ['Fuso', 'America/Fortaleza. O horário do dispositivo do passageiro não define o período de cobrança.'],
        ['Salvar horários', 'Altera a divisão geral de períodos, exige senha e novo MFA e registra auditoria. Não altera os valores de cada tarifa.']
      ]),
      section('Como entender os limites', [
        'No instante de início da noite já vale Noite; no instante de início do dia já vale Dia. Se a noite atravessa a meia-noite, continua noturna até o início do dia.',
        'Exemplo somente de horário: com dia iniciando às 6 e noite às 22, 21h59 está no dia; 22h está na noite; 5h59 ainda é noite e 6h já é dia. Confira os horários atuais na sua tela; o exemplo não altera a configuração.',
        'Os campos aceitam apenas horas inteiras, sem minutos. A configuração também aceita um intervalo noturno que não atravesse a meia-noite: a noite vai do início noturno até antes do início diurno.'
      ]),
      section('Preço e adicional noturno são escolhas separadas', [
        'Cada tarifa tem seu valor de Dia e de Noite. Não existe um percentual automático por ligar o período noturno. Se quiser uma cobrança adicional, cadastre-a explicitamente e confira para não cobrar duas vezes o mesmo custo.',
        'Desmarcar Atender neste período torna essa regra indisponível no período, mas outra regra válida do outro tipo pode atender. A simulação permite escolher o período para conferir os dois cenários; a cotação real usa o período determinado pelo servidor.',
        'Só à noite, nos adicionais, acompanha a definição noturna configurada. O nome técnico antigo do período não obriga início às 22h.'
      ])
    ], ['extras', 'fixed', 'security']),

  chapter('extras', 'Tarifas e rotas', 'Passageiros incluídos e adicionais',
    'Saiba quais valores entram depois do preço base e quando são cobrados.',
    'passageiros incluídos extra pessoa adicional nome valor quando cobrar remover cobrança extra',
    ['apps/admin/src/regions-pricing-admin.js', 'backend/core/src/pricing/managed-operations.ts'], [
      section('Campos de passageiros', [], [
        ['Passageiros incluídos', 'Inteiro entre 1 e 4, limitado à capacidade da categoria na tarifa ativa. É a quantidade coberta pelo preço base.'],
        ['Adicional por passageiro extra (R$)', 'Valor por pessoa além da quantidade incluída. Pode ser zero. Não permite ultrapassar a capacidade máxima da categoria.'],
        ['Passageiros na simulação/corrida', 'Quantidade total solicitada. O sistema rejeita uma quantidade maior que a capacidade da categoria.']
      ]),
      section('Conta por pessoa', [
        'Quantidade de extras = o maior valor entre zero e (passageiros solicitados − passageiros incluídos). Multiplique essa quantidade pelo adicional por pessoa. Passageiros incluídos não recebem desconto se viajar menos gente.',
        'Exemplo de quantidade: com duas pessoas incluídas e três solicitadas, há uma pessoa extra. Com uma solicitada, não há extra nem redução automática do preço base. Os valores monetários continuam sendo definidos por você.'
      ]),
      section('Cobranças extras da tarifa', [], [
        ['Adicionar cobrança extra', 'Abre uma linha. São permitidas até dez cobranças extras na mesma tarifa.'],
        ['Nome do adicional', 'Obrigatório na linha cadastrada, até 80 caracteres. Identifica a cobrança; o texto não cria uma condição automática.'],
        ['Valor (R$)', 'Valor fixo não negativo, com até duas casas decimais. Não é percentual nem valor por km.'],
        ['Quando cobrar', 'Dia e noite aplica em ambos; Só de dia apenas no diurno; Só à noite apenas no noturno configurado.'],
        ['Remover', 'Retira a linha do formulário. A alteração só chega ao catálogo quando você salva a tarifa.']
      ]),
      section('Efeito real dos adicionais', [
        'Todos os adicionais da regra cujo período corresponda à corrida são somados, uma vez cada. Eles não são opcionais para o passageiro e não são multiplicados por passageiros, km ou minutos.',
        'Escrever bagagem, espera, pedágio ou outro nome não cria detecção desse evento. O cadastro atual só condiciona a cobrança ao período; não oferece gatilho por bagagem real, tempo de espera ou evento externo.',
        'O total é: base fixa ou distância com mínimo + passageiros extras + adicionais aplicáveis. Confira as linhas em cada período para evitar duplicações. Adicionais não substituem a obrigação de preço positivo no período de uma tarifa ativa.'
      ])
    ], ['rate', 'distance', 'periods', 'simulation']),

  chapter('simulation', 'Conferir e resolver', 'Simular corrida e conferir o resultado',
    'Teste o preço sem criar corrida, reservar motorista ou realizar cobrança.',
    'simular simulação calcular preço total origem destino período passageiros conferir teste homologação',
    ['apps/admin/src/regions-pricing-admin.js', 'backend/core/src/pricing/management-routes.ts'], [
      section('Como simular', [], [], [
        'Na aba Tarifas e rotas, clique em Simular corrida.',
        'Escolha Origem e Destino entre regiões ativas. Escolha uma categoria ativa e suportada.',
        'Selecione Dia ou Noite e a quantidade de passageiros. Os preços considerados são os já salvos, não alterações ainda abertas em um formulário.',
        'Clique em Calcular preço. Confira o total ou a mensagem de indisponibilidade.',
        'Repita mudando um fator por vez: período, sentido, categoria e passageiros. Assim é mais fácil identificar a configuração responsável.'
      ]),
      section('O que a simulação comprova', [
        'O cálculo usa o motor do servidor, os centros das regiões como pontos e, se necessário, a rota do provedor configurado. Não cria corrida, não procura ou reserva motorista e não processa pagamento.',
        'O valor exibido é o total da cotação tarifária nessa simulação, incluindo extras aplicáveis. Não é comprovante de pagamento nem teste de taxas e regras do meio de pagamento. Essas integrações precisam de validação própria.',
        'Uma tarifa fixa válida dispensa cálculo de km. Por isso, uma simulação fixa aprovada não comprova a disponibilidade do provedor de rotas.',
        'Centros diferentes dos pontos reais, sobreposição ou uma rota interna entre dois pontos distintos podem produzir outro cenário no aplicativo. A aprovação da simulação não substitui testes reais de GPS, mapa, motorista, reserva e pagamento.'
      ]),
      section('Depois de simular', [
        'Confira o mesmo trajeto no Passageiro Web e no Motorista Web com uma conta e um motorista compatível no ambiente autorizado. Teste o comportamento sem motorista e sem tarifa. Para testar pagamento, use o ambiente de testes autorizado do provedor.',
        'Android e iOS não foram atualizados nesta fase. Testes automatizados e navegadores simulados não substituem testes em aparelhos reais. O aceite Web vem antes da sincronização nativa.'
      ])
    ], ['availability', 'overlap', 'distance']),

  chapter('availability', 'Conferir e resolver', 'Por que a opção está indisponível?',
    'Uma sequência de conferência para separar preço, cobertura e motorista.',
    'indisponível não aparece sem preço sem tarifa sem motorista incompatível categoria corrida fora área opção',
    ['backend/core/src/pricing/managed-operations.ts', 'apps/admin/src/regions-pricing-admin.js'], [
      section('Confira nesta ordem', [], [], [
        'Regiões: origem e destino estão ativas, não arquivadas e os pontos reais ficam nas coberturas corretas?',
        'Categoria: está ativa, é um tipo suportado e foi selecionada no passo Operação das duas regiões?',
        'Tarifa: existe regra ativa para essa categoria, par de regiões e direção? A volta está autorizada?',
        'Período: há valor válido no dia ou noite solicitado? O período é o definido pelos horários de Fortaleza?',
        'Passageiros: a quantidade cabe na categoria? A tarifa ativa inclui uma quantidade compatível?',
        'Distância: se a regra é por km, o servidor conseguiu obter uma rota válida?',
        'Motoristas: há alguém elegível, com veículo e requisitos compatíveis e disponível no fluxo operacional?',
        'Atualização: o formulário foi realmente salvo? Recarregue os dados e repita a consulta no aplicativo.'
      ]),
      section('Preço configurado não equivale a oferta disponível', [
        'Uma categoria pode ter preço válido e ainda não ter motorista. Também pode ter motoristas, mas nenhuma regra válida de cobrança. A indisponibilidade precisa ser resolvida na parte correspondente; criar um preço não aprova motorista.',
        'Logo após o reset aprovado, o catálogo ficou com três localidades e zero tarifas comerciais. A indisponibilidade por ausência de tarifa é esperada até você configurar preços válidos. Não é necessário repetir o reset nem restaurar regras antigas.',
        'O selo Ativa de um card não garante atendimento para todos os horários e trajetos. Confira a rota exata e a categoria. Não use um valor improvisado para esconder um erro de cobertura ou suporte operacional.'
      ])
    ], ['region-status', 'category-support', 'rate', 'errors']),

  chapter('security', 'Segurança e histórico', 'Salvar, senha, MFA e edições simultâneas',
    'O que acontece ao confirmar uma mudança e como agir quando outra pessoa editou antes.',
    'confirmar alteração senha MFA autenticador código salvar concorrência conflito atualizar permissão sessão auditoria segurança',
    ['apps/admin/src/regions-pricing-admin.js', 'backend/core/src/pricing/management-service.ts'], [
      section('Salvamento direto com proteção', [
        'Ao salvar, o servidor valida os dados e registra uma nova versão vigente do catálogo junto com a auditoria. Você não precisa administrar rascunhos ou publicar uma segunda vez. Uma rejeição de validação não aplica uma configuração parcialmente válida.',
        'Exige conta administrativa humana e permissão de edição. O fato de a ajuda estar disponível não concede permissão. Botões bloqueados para leitura continuam bloqueados.'
      ], [
        ['Quando pede confirmação', 'Alteração de região, categoria ou tarifa que estava ativa; exclusão/arquivamento; alteração dos horários gerais. Novos cadastros seguem validação e permissões mesmo quando não exigem esse desafio.'],
        ['Sua senha', 'Senha da conta administrativa atual. No formulário de confirmação, de 12 a 256 caracteres. Não envie senha em captura de tela, mensagem ou chamado.'],
        ['Código MFA', 'Seis dígitos do autenticador vinculado à conta. Use código novo; se acabou de entrar ou confirmar outra mudança, aguarde a próxima atualização.'],
        ['Confirmar e salvar', 'Envia a confirmação ao servidor. O servidor valida senha, MFA, sessão e limites de tentativas. A proteção não depende apenas do navegador.'],
        ['Fechar a confirmação', 'Cancela essa tentativa de salvar; o editor anterior permanece aberto. Não confirma a alteração.']
      ]),
      section('Se o código ou a senha falhar', [
        'Confira a conta, a senha e o autenticador correto. Um código já utilizado no login ou em outra confirmação não pode ser reutilizado. Aguarde um código novo e confira o relógio do autenticador.',
        'Muitas tentativas podem causar bloqueio temporário. Respeite a mensagem e aguarde; não tente contornar a proteção abrindo várias abas. Sessão encerrada exige novo login. Nunca informe senha/MFA a outra pessoa para resolver um erro.'
      ]),
      section('Quando outro administrador salva antes', [
        'Cada edição leva a referência do catálogo que você consultou. Se outra pessoa o alterou antes, o servidor rejeita a edição desatualizada e pede atualização, em vez de sobrescrever o trabalho anterior.',
        'Anote sua intenção sem copiar credenciais, feche o editor, clique em Atualizar dados e confira a versão atual. Abra o registro novamente, refaça apenas o necessário e salve. Não repita às cegas uma edição antiga.',
        'Se a conexão cair depois de clicar em salvar, a resposta pode não ter chegado embora o servidor tenha concluído. Atualize e confira o registro antes de criar outro. A operação usa identificador de tentativa para reconhecer reenvios, mas fechar e recriar um cadastro pode produzir outro registro.'
      ])
    ], ['history', 'archive', 'errors']),

  chapter('archive', 'Segurança e histórico', 'Excluir, desativar e restaurar com segurança',
    'Retire da operação sem apagar corridas, pagamentos ou versões anteriores.',
    'excluir apagar arquivar desativar restaurar recuperar dependência histórico reativar voltar tarifas relacionadas',
    ['apps/admin/src/regions-pricing-admin.js', 'backend/core/src/pricing/management-service.ts'], [
      section('Diferenças entre as ações', [], [
        ['Desativar', 'Desmarque Região ativa, Categoria ativa ou Tarifa ativa no editor e salve. O registro fica cadastrado, fora do uso em novas cotações.'],
        ['Excluir', 'Neste módulo, retira da operação por arquivamento: marca como arquivado e desativado. Não apaga fisicamente o registro nem seus vínculos históricos.'],
        ['Excluir com segurança', 'Confirma a retirada, mostra o efeito nas tarifas relacionadas e exige senha/MFA. Até concluir a confirmação no servidor, a retirada não está confirmada.'],
        ['Restaurar', 'Na seção de arquivados da respectiva aba, traz o registro de volta como desativado. Não recupera automaticamente toda a operação anterior.']
      ]),
      section('Efeito sobre dependências', [
        'Excluir ou desativar uma região desativa tarifas em que ela seja origem ou destino. Retirar uma categoria do atendimento da região também desativa as tarifas afetadas. Excluir ou desativar uma categoria desativa suas tarifas. Excluir uma tarifa não exclui região nem categoria.',
        'As corridas históricas, pagamentos, comprovantes e versões anteriores são preservados. Uma corrida já registrada com preço congelado não é recalculada porque você editou uma tarifa. Cancelamento e reembolso têm fluxos próprios; arquivar uma região não substitui esses procedimentos.'
      ]),
      section('Como voltar a operar um registro arquivado', [], [], [
        'Abra a seção de registros arquivados ao final da lista e clique em Restaurar no item correto.',
        'Edite o registro restaurado e revise seus campos. Ele volta desativado por segurança.',
        'Para região/categoria, confirme permissões e compatibilidade antes de ativar. Salve e confirme quando solicitado.',
        'Revise as tarifas dependentes e reative apenas as que continuarem corretas. Não há religamento automático das tarifas desativadas.',
        'Simule novamente e confira a disponibilidade real nos aplicativos Web.'
      ])
    ], ['history', 'security', 'availability']),

  chapter('history', 'Segurança e histórico', 'Histórico, auditoria e efeito nos aplicativos',
    'Saiba o que muda imediatamente e o que continua preservado.',
    'histórico auditoria usuário data anterior novo versão recuperação publicação rascunho corridas pagamento apps web',
    ['backend/core/src/pricing/management-service.ts', 'backend/core/src/pricing/management-routes.ts', 'apps/admin/src/regions-pricing-admin.js'], [
      section('O que você vê no histórico', [
        'Na aba Configurações, abra Histórico de alterações. A lista desta tela mostra data/hora de Fortaleza e o autor das versões publicadas retornadas pelo servidor. A consulta é limitada às 50 versões mais recentes retornadas; não é um relatório de auditoria completo com todos os campos.',
        'Por trás da tela, cada alteração relevante registra usuário, operação, referência anterior, configuração anterior e nova, incluindo mudanças de horários. As versões anteriores ficam preservadas para auditoria e recuperação técnica.',
        'O histórico mostrado aqui não tem um botão para restaurar todo um catálogo antigo. Restaurar um item arquivado é uma ação diferente. Recuperação de um catálogo completo exige conferência técnica, autorização e proteção contra sobrescrever alterações posteriores.'
      ]),
      section('Efeito de uma alteração salva', [
        'A nova configuração passa a ser a referência para novas consultas e cotações do servidor. Atualize o aplicativo ou refaça a consulta para conferir. Uma tela já aberta pode ainda mostrar dados obtidos antes da alteração.',
        'Preços registrados e congelados em corridas existentes são preservados; editar uma regra não reescreve o valor histórico de uma viagem ou pagamento. Isso protege a consistência entre cotação aceita, reserva e cobrança.',
        'As configurações de pagamento, taxas do provedor e repasses são módulos separados. Uma tarifa não muda as credenciais Asaas/Mercado Pago e não faz transferências financeiras.',
        'Na fase atual foram atualizados ADM e aplicativos Web. Android e iOS ficaram sem atualização; não se deve presumir que o aceite Web equivale à homologação dos clientes nativos.'
      ])
    ], ['security', 'archive', 'simulation']),

  chapter('errors', 'Conferir e resolver', 'Mensagens de erro e como resolver',
    'Consulte a causa provável antes de repetir um cadastro ou mudar um preço.',
    'erro inválido falha problema ajuda indisponibilidade autorização acesso duplicado conflito rota autenticação busca',
    ['backend/core/src/pricing/managed-operations.ts', 'backend/core/src/pricing/management-service.ts', 'backend/core/src/pricing/management-routes.ts'], [
      section('Validações de cadastro', [], [
        ['Selecione o ponto da região no mapa', 'Confirme o centro clicando no mapa, escolhendo um resultado ou aplicando Latitude e Longitude. Apenas digitar nome/município não posiciona uma região nova.'],
        ['Informe latitude entre… e longitude entre…', 'Preencha os dois campos com graus decimais válidos. Ponto ou vírgula são aceitos; mantenha o sinal negativo quando fizer parte da coordenada. O ponto anterior não foi substituído pela tentativa inválida.'],
        ['Digite pelo menos três caracteres / Busca indisponível', 'Use de 3 a 160 caracteres. Se o serviço de pesquisa estiver indisponível, selecione manualmente no mapa e confira os campos administrativos.'],
        ['Ative a categoria nas duas regiões antes de ativar a tarifa', 'Confira região e categoria ativas, não arquivadas, e a seleção no passo Operação de ambas as regiões.'],
        ['Já existe uma tarifa deste tipo para esta rota, categoria e período', 'Edite a existente ou retire a duplicação de direção/período. Ida e volta marcadas também cobrem o sentido inverso.'],
        ['Ative pelo menos um período com preço válido', 'Marque Dia e/ou Noite e preencha preço maior que zero. Se quer guardar sem atender, desative a tarifa.'],
        ['Passageiros incluídos excedem a capacidade', 'Ajuste a tarifa à capacidade da categoria. Não aumente a capacidade além do suporte real só para passar na validação.'],
        ['Veículos de carro em Jericoacoara precisam do requisito 4x4', 'Confira a categoria de carro e a exigência 4x4 antes de habilitar atendimento na região principal de Jericoacoara.'],
        ['Categoria ainda não possui suporte operacional', 'Mantenha o tipo novo desativado. Ícone e nome não implementam compatibilidade operacional.'],
        ['Valor inválido / fora do limite', 'Confira campo obrigatório, sinal, casas decimais e limites. Preço base de período habilitado deve ser positivo. Campo de preço não aceita texto ou percentual.']
      ]),
      section('Sessão, concorrência e serviços', [], [
        ['Confirme com sua senha e um novo código MFA', 'É um desafio de segurança para a alteração. Use sua conta e aguarde um código novo se o anterior já foi consumido.'],
        ['Outro administrador alterou os dados / Os dados mudaram', 'Atualize a tela, confira a edição feita pela outra pessoa e reabra o registro antes de tentar novamente.'],
        ['Acesso negado / sem permissão', 'A conta pode ser apenas de leitura ou não ter a permissão necessária. A ajuda não altera as permissões da conta.'],
        ['Catálogo não preparado / salvamento indisponível', 'Aquele ambiente não está habilitado corretamente para a nova gestão. Informe o erro para conferência técnica; não execute reset por conta própria.'],
        ['Fora das regiões atendidas / categoria indisponível', 'Confira coberturas, categoria nas duas pontas, suporte operacional e passageiros.'],
        ['Ainda não há tarifa válida para este trajeto e horário', 'Confira direção, categoria, período, estado da tarifa e regiões selecionadas. Sem regra válida, a indisponibilidade é a resposta correta.'],
        ['Distância de rota necessária / cálculo de rota indisponível', 'A regra por km depende do provedor de rotas do servidor. Não insira distância em linha reta como substituto.'],
        ['Erro de conexão ou resposta incerta ao salvar', 'Confira os dados atuais antes de repetir ou criar outro registro. Se persistir, informe tela, ação, horário e mensagem sem expor senha/MFA.']
      ]),
      section('O que enviar ao pedir ajuda', [
        'Informe a aba, o nome do registro, a ação tentada, o horário e a mensagem exibida. Uma captura pode ajudar, desde que não mostre senha, código MFA, chaves privadas ou dados pessoais desnecessários. Não envie conteúdo de backups.',
        'Este manual explica o comportamento implementado. Se a tela apresentar resultado diferente, registre a divergência para correção; não compense uma falha inventando preços ou desativando proteções.'
      ])
    ], ['security', 'availability', 'rate', 'map'])
];

export const helpTopicForLabel = Object.freeze({
  'Nome da região':'region', 'Pesquisar no mapa':'map', 'Latitude':'map', 'Longitude':'map', 'Município':'region', 'Estado':'region', 'Raio de cobertura (km)':'map',
  'Nome':'category', 'Descrição curta':'category', 'Ícone':'category', 'Quantidade máxima de passageiros':'category',
  'Nome da tarifa':'rate', 'Forma de cobrança':'fixed', 'Categoria':'category', 'Origem':'rate', 'Destino':'rate',
  'Preço (R$)':'rate', 'Valor mínimo (R$)':'distance', 'Passageiros incluídos':'extras', 'Adicional por passageiro extra (R$)':'extras',
  'Nome do adicional':'extras', 'Valor (R$)':'extras', 'Quando cobrar':'extras', 'Período':'periods', 'Passageiros':'extras',
  'Sua senha':'security', 'Código MFA':'security'
});
export const helpTopicForCheck = Object.freeze({
  'Usar o mesmo preço na volta':'rate', 'Tarifa ativa':'rate', 'Atender neste período':'periods',
  'Exigir veículo 4x4 em trajetos de Jericoacoara':'category', 'Categoria ativa':'category-support',
  'Região ativa':'region-status', 'Definir uma tarifa agora':'rate'
});
export const normalizeHelpSearch = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
export function searchPricingGuide(query, chapters = pricingGuide) {
  const terms = normalizeHelpSearch(query).split(/\s+/).filter(Boolean);
  return chapters.filter(item => {
    const text = normalizeHelpSearch([item.group, item.title, item.summary, item.keywords,
      ...item.sections.flatMap(s => [s.title, ...s.paragraphs, ...s.rows.flat(), ...s.steps])].join(' '));
    return terms.every(term => text.includes(term));
  });
}
