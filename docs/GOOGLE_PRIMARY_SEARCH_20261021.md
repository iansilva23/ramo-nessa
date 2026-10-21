# Google Places como fonte principal da pesquisa Web

## Comportamento

No catálogo gerenciado do Passageiro Web, autocomplete, busca manual e abertura
do local solicitam searchMode google ao Core. A consulta original é enviada ao
Google, sem transformar prefixos em nomes de uma lista comercial antiga e sem
exigir que o texto corresponda ao identificador interno da região. As sugestões
válidas mantêm a ordem do provedor, incluindo cidades, endereços e estabelecimentos.

A cobertura configurada no ADM orienta a relevância por locationBias, sem atuar
como locationRestriction. A configuração de idioma/país do autocomplete continua
pt-BR/Brasil. A quantidade e o ranking de sugestões dependem do Google; esta
mudança não promete uma cópia idêntica do aplicativo Google Maps ou um resultado
específico para toda abreviação. A busca manual pede até dez resultados e mantém
as validações de resposta do provedor. O debounce e os tokens de sessão existentes
foram preservados. Nenhuma chave ou configuração sensível foi alterada.

No modo novo, a presença de resultados no GeoDB não encerra a pesquisa digitada
antes do Google. O GeoDB e suas ferramentas foram preservados para outros usos.
Endereços previamente salvos com ID geo: são resolvidos quando o usuário os
seleciona explicitamente, revalidando cobertura e prova assinada, sem substituir
as sugestões digitadas. Falha do Google é apresentada como erro, sem inventar
resultados locais. A busca manual gerenciada não reutiliza o cache antigo de
listas vazias ou provas vencidas.

Após a escolha, o Core classifica as coordenadas conforme as regiões vigentes.
Dentro da cobertura, devolve o ID gerado pelo ADM e uma prova assinada. Fora dela,
o local continua identificável, porém sem região aprovada/prova; a tela existente
informa indisponibilidade e o servidor continua recusando cotação ou corrida fora
da cobertura. Nenhum nome digitado, dica do navegador ou resultado Google autoriza
tarifa, categoria, motorista ou cobrança. Os preços atuais são preservados.

O novo fluxo corrige também a busca manual que podia sobrescrever a referência
gerenciada com uma localidade antiga depois de classificar as coordenadas.

## Preservação e limites

O cliente opta pelo fluxo novo somente em Web com catálogo gerenciado. Clientes
que não enviam a opção mantêm seu contrato anterior. Android/iOS não foram
compilados ou atualizados; funcionalidades Web ativas e homologadas são a
referência para a sincronização móvel futura, conforme a regra do projeto.

Mudanças Core restritas a server.ts e dois módulos Places (um novo). As alterações
de server.ts estão nas três rotas de pesquisa e no import do módulo; autenticação
ocorre antes da seleção do fluxo. Providers de pagamento, Asaas, ledger, repasses,
reservas, migrations, dependências, mapas e ADM não foram modificados. O pacote
Core compara os módulos compilados com a referência anterior e recusa qualquer
delta fora de server.js e dos dois arquivos Places, incluindo os respectivos mapas
de origem. O pacote não executa implantação ou SQL.

O código legado não foi removido para preservar clientes existentes e histórico.
Ele não governa o novo fluxo de pesquisa gerenciada. As validações de cobertura,
tarifa e elegibilidade continuam no servidor.

## Verificação

Testes unitários passam consultas como fortal, Fortaleza, Fortaleza CE, hotel,
aeroporto, rua e nomes com/sem acento pelo provedor real encapsulado com transporte
sintético. Conferem texto original, sessão, ordem, bias sem restrição rígida,
detalhes de estabelecimento, ID gerado, prova assinada, local fora da cobertura,
busca manual, indisponibilidade do Google e sessão inválida.

O teste HTTP inicia o Core real com PostgreSQL isolado e um servidor Google
sintético. Uma entrada GeoDB que corresponderia à consulta comprova que o Google
é chamado mesmo assim. Também verifica detalhes, ausência de autorização fora da
cobertura, preservação de endereços salvos, autenticação, contrato antigo e erro
do provedor sem fallback silencioso. O catálogo e o GeoDB são comparados ao final.
O primeiro fixture publicado omitiu os campos de autoria da publicação; foi
corrigido para respeitar o CHECK existente, sem alterar o banco ou a aplicação.

Testes Flutter HTTP/Chrome verificam consultas originais, ausência de ID externo
legado nas sugestões, seleção de hotel, prova/região recebidas e renovação da
busca manual. O teste nativo confirma que o novo protocolo não é enviado nesse
cliente. Um controle negativo usa o serviço instalado e exige a falha específica
da reescrita de fortal antes de validar a candidata.

Esses testes não chamam a API Google com uma chave real. O aceite de sugestões e
relevância com o provedor real deve ocorrer após a instalação autorizada. Não se
afirma validação em aparelho físico a partir de Chrome/WebKit de laboratório.

## Atualização e identificação do ambiente

Esta correção exige Core e Passageiro Web compatíveis. Atualizar somente os
arquivos Web não conclui a mudança. Nenhuma atualização foi executada na VPS
durante o desenvolvimento. Não reutilizar os scripts antigos de reset ou a
atualização apenas de mapas para instalar esta correção.

Antes de montar a troca, conferir o inventário de leitura e as assinaturas do
Core efetivamente instalado. O checkout Git da VPS não prova qual imagem está
rodando. Uma alteração financeira de outra branch deve ser preservada; divergência
de assinatura exige conciliação, sem sobreposição automática.

Fonte de aplicação revisada: e193f5d1b0e51777aa0c29538249d046ad4f89d1.
Candidata de pacotes: 731d524d55ecfab945605c00611abd067bc955c5.
Base de comparação Core: 0f5305ddef3398112ca1e7d10a00fd05fa8548e8 (mesmos fontes
Core de e24a5ecb93e22b8054b599c4f377809fc63dcffb).
Assinatura JS compilada da base:
fd2e9deff407ab687d7085abf12c87ff0256856c08a809332860797e09bcd245.
Assinatura JS compilada da candidata:
28d8faa762d6da73c3a7bf0fa26f1fbe6e653cf9aa202be7c268d9f45aba5509.
O manifesto do pacote contém hashes por arquivo e do lock. Somente seis arquivos
compilados de patch são incluídos; financeiro e migrations permanecem iguais.

Referências oficiais utilizadas na implementação:
https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
https://developers.google.com/maps/documentation/places/web-service/text-search

## Evidências de CI

Run 39692625779, fonte e193f5d1b0e51777aa0c29538249d046ad4f89d1:
suíte serial completa do Core/PostgreSQL com 853 aprovados, zero falhas e dois
ignorados existentes. Cinco testes do inventário de leitura também aprovados.
O teste de Core HTTP/Google primário foi executado e aprovado, não ignorado.
Run 39692668824 inclui novamente esse teste HTTP no job PostgreSQL, aprovado,
com os demais testes do servidor, painel e clientes Web na mesma revisão.
Run 39692668824: seis jobs aprovados, incluindo análise, testes e builds dos dois
clientes Web, navegação/segurança no navegador, Core, ADM e PostgreSQL. O controle
negativo reproduziu a reescrita de fortal no cliente instalado pela assertiva
GOOGLE_PRIMARY_MUST_KEEP_QUERY, e os casos novos passaram com a candidata.

A primeira rodada do pacote (39692668930) aprovou Chromium/Passageiro, mas
WebKit/Passageiro registrou um erro Fetch de car.png durante a sequência
de recargas do teste. A sincronização do harness foi ajustada para aguardar os
assets antes das recargas deliberadas. As assertivas de erros JavaScript, CSP,
requisições de assets e conexões externas permanecem ativas. Não se modificou o
código do mapa nem se aprovou o artifact de depuração daquela rodada.
Run 39693460184 aprovado: dois builds configurados, quatro verificações de sessão
Chromium/WebKit com assets sem falhas/interrupções, controle negativo do SDK de
mapas e validação do patch Core contra a base compilada. As verificações de erros
JavaScript, CSP e conexões externas foram mantidas. O ajuste do harness não mudou
os fontes de aplicação revisados e193f5d1.

Artifacts aprovados, fonte 731d524d55ecfab945605c00611abd067bc955c5:

- Web: 12389892455, SHA-256 ZIP
  71c3c8348bdde3271c3dd14dfc8f12c350cd347490801adb2ec01c397024b665.
- Patch Core (não é instalador): 12390246564, SHA-256 ZIP
  d32112d01b48c2c72af6a70ebab3bc8f565c3c87d6e3ac5fc2c42314f507d2eb.

Não usar o artifact de depuração 12390370278 como release. Ainda é obrigatório
conferir o Core ativo e montar/ensaiar a troca compatível com o runtime real
antes de qualquer atualização na VPS. Nenhuma ativação foi realizada nesta etapa.

Validação local dos artifacts: 108 arquivos Web, 94.500.512 bytes expandidos,
manifesto/fonte/hashes corretos e Maps/Firebase públicos preservados nos dois
clientes. Os seis arquivos do patch Core e os dois hashes de árvore compilada
foram conferidos contra o manifesto. Run 39693460342 terminou com seis jobs
aprovados na mesma revisão dos pacotes. A identificação do runtime real da VPS
permanece pendente do retorno do operador.
