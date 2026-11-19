# Abertura direta dos aplicativos Web

Por decisão do proprietário, a tela de deslizar foi removida por completo do
Passageiro e Motorista Web. Os arquivos JavaScript/CSS e seus imports deixam
de existir. Não há chave de ativação, página ou configuração nova no ADM,
endpoint, armazenamento de preferência ou migration para esse recurso.

A tentativa anterior de criar uma opção no ADM foi descartada antes da
implantação; nenhuma alteração daquela tentativa foi aplicada na VPS.

O aplicativo instalado abre diretamente, inclusive ao voltar do segundo plano.
Login, sessão, GPS, notificações, Maps, busca Google, preços e pagamentos seguem
o fluxo aprovado. Android e iOS nativos não recebem builds nesta etapa.

O teste reutiliza o par Web Google aprovado (731d524d), remove somente os dois
imports e os dois arquivos da tela por aplicativo e confere que main.dart.js
permanece idêntico. Testes Chromium/WebKit exercitam abertura instalada, retorno,
primeiro controle de login, cookie seguro, recuperação da sessão e logout.
O validador do bundle recusa imports ou arquivos remanescentes da tela removida.

O código fica no PR DRAFT 37, sem merge ou alteração da VPS pelo desenvolvimento.
A publicação deve preservar os bundles anteriores para retorno e não atualizar
Core/ADM/banco. O aceite no iPhone real ainda é necessário depois de instalar.

## Validação da entrega

Código e ferramentas validados em `8bee52cca5aa3a4f637cde673e19f5ec7df58284`.

- [Chromium e WebKit](https://github.com/iansilva23/ramo-nessa/actions/runs/39715656262):
  Passageiro e Motorista aprovados em ambos os motores; sem erros JavaScript,
  falhas de assets ou violações das diretivas de segurança verificadas.
- [Atualização e retorno isolados](https://github.com/iansilva23/ramo-nessa/actions/runs/39715656444):
  3 testes de remoção/argumentos, testes existentes de troca do Gateway e 8 testes
  do empacotamento aprovados. Ensaio com Caddy real e PostgreSQL descartável
  comprovou troca HTTP dos dois apps, retorno após falha provocada e preservação
  dos registros sentinela, ambiente, imagem, ADM, Caddy e serviços protegidos.
  Core/mapas/site são sentinelas nesse ensaio, não homologação de corridas reais.

## Instalação somente Web

Extrair `deploy/staging` do commit validado acima. Executar com sudo
`prepare-web-direct-entry.mjs`, seguido de `activate-web-direct-entry.mjs` com
o diretório `/opt/ramo-nessa-regions/direct-entry-updates/2c8963b2a0a6` e SHA-256
do arquivo `prepared.private.json` criado nesse diretório.

Não há download de ZIP. O preparo verifica o plano Google confirmado pelo
proprietário e os bytes instalados; copia o bundle para uma release inativa,
remove exclusivamente os quatro assets e seus imports e verifica cada outro
arquivo. Mudanças concorrentes interrompem o procedimento. A ativação recria
somente o Gateway com a mesma imagem e troca apenas o bind dos apps Web.
Os arquivos anteriores são mantidos; falhas verificadas acionam retorno.

Saída esperada: `ENTRADA_DIRETA_ATUALIZADA`. Nenhum SQL, reset de catálogo ou
atualização de Core/ADM/nativos. O procedimento ainda não foi executado na VPS.
Depois de instalar, fechar e reabrir os dois apps instalados no iPhone, conferir
login e sessão existente e retornar do segundo plano. Os testes de navegador
não substituem esse aceite em aparelho real.
