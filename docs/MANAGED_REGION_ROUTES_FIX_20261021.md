# Regiões cadastradas no ADM e disponibilidade no Passageiro Web

## Defeito e correção

O aplicativo instalado com fonte 0ad3ba73cfe2a1265344de09c75309b95daac8dd
classificava corretamente os pontos nas regiões gerenciadas, mas a tela inicial
ainda filtrava as categorias pela matriz histórica de pares de zonas. Jeri com
uma região externa exigia os identificadores literais fortaleza ou airport-jjd.
Uma região criada pelo ADM recebe um identificador próprio, portanto uma tarifa
ativa podia ser bloqueada antes da consulta ao servidor.

A consulta de leitura fornecida pelo operador confirmou regiões e tarifas ativas
para Jeri/Fortaleza e Jeri/aeroporto, categoria comfort_black habilitada nas duas
pontas e tarifas bidirecionais com ambos os períodos configurados. Há registros
antigos arquivados e substituições ativas; não restaurar os antigos nem alterar
seus preços. Os valores comerciais e o inventário privado não foram incluídos
neste documento ou nos fixtures.

O Passageiro Web em managementMode managed passa a usar a interseção entre as
categorias globais permitidas e as categorias habilitadas nas duas regiões
identificadas pela cobertura vigente. O mesmo caminho atende regiões futuras,
sem cadastrar aliases no código. Regiões sem permissões, desativadas, arquivadas
ou desconhecidas falham fechadas. Somente categorias com implementação real no
enum do aplicativo são candidatas à cotação.

A lista permite solicitar preços; não confirma tarifa nem oferta de motoristas.
VehicleSelectionScreen continua exigindo cotação exata do servidor, removendo
categorias recusadas por UNKNOWN_ROUTE/UNAVAILABLE_CATEGORY e impedindo continuar
quando não há preço confirmado. O servidor conserva suas validações de cobertura,
coordenadas, período, sentido, disponibilidade e preço. A prova de local externo
continua exigida pelos fluxos existentes. Nenhuma autorização foi removida.

## Escopo

Dois arquivos de código do Passageiro alterados: a política pública agora lê as
permissões das regiões e a tela inicial usa essas permissões no modo Web
gerenciado. O comportamento nativo e do catálogo legado permanece no caminho
anterior; os fontes antigos são preservados para histórico e sincronização
nativa posterior. Não houve mudança de preço, cadastro, migração, código Core,
financeiro, ADM, mapa ou dependência. O patch Maps Web 0.6.4+2 foi conservado.

O operador confirmou a instalação anterior 0ad e o funcionamento do mapa no
iPhone. A atualização desta correção deve partir dessa versão, usando o plano
privado já confirmado, sem repetir reset e sem sobrepor uma atualização
concorrente. A ferramenta deve preservar a imagem/ADM, Caddy, ambiente e
configurações atuais, atualizar somente os bundles Web e verificar o retorno em
caso de falha. Não executada na VPS durante o desenvolvimento.

## Verificação

Fixtures sintéticos cobrem três regiões com IDs gerados (Fortaleza, aeroporto e
uma localidade nova sem alias), ambos os sentidos e períodos. Os testes do Core
verificam tarifa fixa prioritária, distância autoritativa, ausência de tarifa,
categoria proibida, coordenadas inválidas e tarifa unidirecional. Foram aprovados
14 casos novos e a análise de tipos do Core localmente.

No Flutter, os testes percorrem a tela inicial, retorno da busca, cálculo de
rota, confirmação de destino, escolha de categoria e recebimento da cotação.
Verificam as seis combinações de região/sentido, ausência de categoria comum e
recusa da cotação sem liberar a confirmação. Um controle negativo executa o mesmo
caso de Fortaleza com a tela instalada e exige falha na assertiva específica do
bloqueio. Os casos Web precisam passar em Chrome; os testes nativos verificam
que a ativação gerenciada permanece restrita à Web.

O teste novo teve uma falha inicial na construção de uma lista mutável do fixture
(tipo genérico de List.addAll), corrigida sem alterar código de produção. Os
nove casos do fluxo gerenciado passaram em Chrome no run 39689274315 antes de
esse run ser substituído pela revisão operacional. A rodada final é registrada
ao concluir as verificações. Aceite conectado na VPS e em iPhone real depende da instalação
e do teste pelo responsável. Não confundir testes sintéticos com corrida real.

## Pacote configurado e atualização

Fonte dos bundles: 0f5305ddef3398112ca1e7d10a00fd05fa8548e8.
Fonte do código revisado: 8c24469743238ddf0bb7b43109f1accf94fb838b.
Run configurado 39688778893 aprovado: compilação dos dois Web, prova negativa
da inicialização com o SDK anterior e quatro verificações de sessão em
Chromium/WebKit com serviços sintéticos. O fixture Motorista não representa
uma corrida operacional com GPS/motorista real.

Artifact 12388210585, SHA-256 ZIP:
3026f5f9ac800445ea37faaf214871ec6c3e481a805680ddc619c8be4257f35d.
Manifesto/fonte/hashes de 108 arquivos conferidos; 94.500.199 bytes expandidos.
Maps/Firebase públicos dos dois Web iguais à versão instalada 0ad. Não distribuir
artifacts example.invalid de revisão ou arquivos de depuração como instalação.

Ferramentas operacionais: fa8775401c2947d5c50eb3e7b343ea6bdb2ec866.
Referência instalada exigida:
/opt/ramo-nessa-regions/map-web-updates/0ad3ba73cfe2/prepared.private.json,
SHA-256 74b6fed1673311134dfe6af7d3b48ad6578037f300c27a415534c02012375b94,
conforme retorno fornecido pelo operador. Nova pasta de preparação:
/opt/ramo-nessa-regions/map-web-updates/0f5305ddef33.

Extrair deploy/staging do commit operacional fixado e executar a ferramenta
prepare-web-map-update.mjs com ZIP absoluto e SHA do ZIP. A ativação explícita
usa activate-web-map-update.mjs com a pasta nova e SHA do plano privado retornado
na preparação. O SHA do plano não é o SHA do ZIP. Não repetir preparação já
existente, contornar divergência de versão, nem executar reset de regiões.

O processo preserva Core, banco, financeiro, ADM, Caddy, ambiente e apps nativos.
Recria somente o Gateway com sua imagem atual para trocar os bundles Web,
verifica arquivos publicados via HTTP e mantém os antigos para recuperação.
Recusa concorrência detectada ou mudanças fora dos dois arquivos revisados.
As dependências são comparadas byte a byte à versão 0ad, mantendo o patch de mapa
já aprovado no aparelho. Os contratos locais de preparação/ativação/retorno
passaram: 23 testes Node e seis Python.

Run 39689484125: três cenários aprovados. O fixture recriou a cadeia de instalação
até a versão 0ad que o operador confirmou e, em seguida, atualizou para 0f5305.
O cenário map_rollback provocou uma falha após verificar os arquivos novos e
comprovou retorno aos bundles 0ad com publicação HTTP correta. O catálogo,
corridas, pagamentos e ledger permaneceram iguais durante upgrade/retorno dos
mapas. O rollback do reset antigo é um cenário legado separado, exclusivamente
em banco sintético. Não há reset na atualização real desta correção.
Run 39689484206: contratos operacionais aprovados no CI.

Na revisão final fa877540, run 39689484164, os nove testes de rotas gerenciadas
passaram no Chrome. O controle negativo também passou: a mesma seleção de
Fortaleza usando a tela 0ad foi rejeitada pela matriz antiga com a assertiva
MANAGED_GENERATED_REGION_MUST_REACH_ROUTE. A candidata alcança a consulta de
preço sem esse bloqueio. A análise e a suíte do Passageiro, câmeras, alfinete,
transição e catálogo gerenciado passaram, além de Core/ADM/PostgreSQL/browser.
O run final 39689484164 terminou com seis jobs aprovados, incluindo os dois
builds Web. O pacote configurado acima usa os mesmos fontes de aplicação.
Nenhuma atualização foi executada na VPS pelo agente. Após a instalação pelo
responsável, conferir no aparelho Jeri/aeroporto e Jeri/Fortaleza, inclusive
retorno e categoria 4x4, com os valores atuais do ADM e sem efetuar cobrança real
como parte do aceite de disponibilidade/cotação.
