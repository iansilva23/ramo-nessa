# Motorista — cartões brancos e GPS Cinema

Base auditada: ops/passenger-polish-live-20261026, 2e321144a799177cc8cc93eb68a8e6a2a2c0f43d, instalação de destino/notificações confirmada no relatório desse lote. Checkout limpo, branch isolada fix/driver-white-cards-gps-20261026. Fonte da aplicação corrigida: f84acc46292537266e85215bf39253b2dc1dbec7.

## Diagnóstico e correção

O cartão de chegada usava o conteúdo legado construído com o tema externo escuro, mesmo dentro do frame branco. A construção dos cartões expandidos passa a ocorrer com a paleta clara local; o tema do mapa e do restante do app permanece selecionável. O cabeçalho de Nova corrida também fica branco, com contador escuro e trilho claro. A barra minimizada continua preta, sem duplicação do cartão.

A compilação Web de destino/notificações não fornecia as opções de bússola/cinema e o Map ID; os padrões anteriores eram false/vazio. O código ainda existia, mas ficava desativado. Foram restaurados padrões Web habilitados e o Map ID público de produção `de20bf289d6db3ad15fdb14b`, recuperado dos logs do build oficial do PR #71 (run 40171548645, job 121103241856). Não foi usado DEMO_MAP_ID. Overrides explícitos de compilação continuam disponíveis, e a condição kIsWeb mantém essa ativação restrita à Web.

A inicialização recuperava a corrida ativa, mas não o modo de navegação. Agora recupera a navegação para corridas a buscar ou em andamento; não ativa navegação em pagamento pendente, chegada/conclusão ou ausência de coordenadas. O acompanhamento periódico de uma mesma corrida respeita a escolha de parar navegação. O fluxo já existente mantém vista 2D até o embarque e transição de zoom/inclinação ao iniciar a corrida, com pausa ao mover o mapa e recentralização explícita.

## Escopo e instalação

Backend, ADM, Passageiro, pacotes compartilhados e configurações públicas existentes não foram alterados (diff conferido). Não há migração, cobrança, alteração de autenticação nem solicitação de corrida automática. Android/iOS não são distribuídos por este pacote.

Instalador específico derivado do mecanismo anterior de atualização somente do Motorista: preserva release anterior imutável, confere pacote/arquivos, configuração Maps/Firebase, Compose e identidade dos serviços; cria nova release, copia Passageiro sem alterar bytes e muda somente o mount Web do Gateway usando a imagem/configuração ativa. Modelos privados de retorno ficam protegidos. Recusa concorrência; verifica bytes publicados e restaura a release anterior quando necessário, inclusive se o Gateway desaparecer durante a recriação. Não substitui Core nem restaura banco.

## Verificação

Testes previstos: cinco estados com aparência escura e superfície branca, chegada legível, retomada de navegação no cold launch, regressão Flutter completa, configuração/câmera em Chrome, bundle real com Map ID preservado, sessão instalada e autenticação em Chromium/WebKit, Caddy real com instalação e dois retornos provocados. Execução aprovada: https://github.com/iansilva23/ramo-nessa/actions/runs/40357749281, instalador/empacotamento na revisão 9f421ef68a5d18f55f348da79fa799276ebb99d8. Análise sem problemas, suíte Flutter e testes Chrome passaram; sessão compilada instalada/login/cookie/logout passou em Chromium e WebKit. Três cenários Caddy reais passaram: sucesso, falha após troca e Gateway ausente. Nove testes locais dos contratos de mount/configuração/retorno também passaram. Os testes não tocaram provedores reais.

A implantação na VPS ainda não foi executada nesta correção. Funcionamento de WebGL, GPS em movimento, aparência do mapa vetorial no tema escuro e abertura instalada precisam ser conferidos em aparelho real após instalar. O ensaio isolado não representa uma corrida real. PR #79 DRAFT, sem merge.


## Pacote verificado

Release: https://github.com/iansilva23/ramo-nessa/releases/tag/driver-white-gps-20261026-r1

- ZIP `RamoNessa-Motorista-Branco-GPS.zip`: SHA-256 `6ead2f4fa420bc9fc786b7eca442f3031db6ca690c873283f7e3c95d604b7273` (18.295.374 bytes).
- Instalador `Instalador-Motorista-Branco-GPS.tar.gz`: SHA-256 `0167fc96f3224ed19e9f0894245b776243f730e3e0ba193dd4c9ec14f06e90e5`.
- Código de instalação fixado: `9f421ef68a5d18f55f348da79fa799276ebb99d8`, `deploy/staging/driver-white-gps-update.mjs`.

O operador deve baixar o ZIP, verificar o SHA e executar o instalador fixado com sudo. O resultado esperado é `MOTORISTA WEB ATUALIZADO`. Em erro, enviar somente a saída normal e não repetir nem enviar configurações privadas. A publicação do pacote não é instalação na VPS; não foi feito merge.
