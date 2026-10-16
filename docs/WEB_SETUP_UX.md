# Assistente Web de instalação e permissões

A alteração é exclusiva do caminho `kIsWeb` dos apps passageiro/motorista.
O gate e a chave de conclusão nativos continuam os anteriores. A chave Web v2
apresenta o assistente também aos usuários que concluíram o onboarding Web v1.

## Fluxo

- Instalação aparece primeiro. No iPhone, instruções com ícones de Compartilhar,
  Adicionar à Tela de Início e abertura pelo ícone. Em navegador compatível, o
  prompt de instalação é disparado diretamente no toque. Aceitar o prompt não
  equivale a instalação concluída: só o evento `appinstalled` ou modo standalone
  confirma a instalação, e a aba continua identificada como navegador.
- Localização usa `getCurrentPosition` diretamente no toque e não depende de
  `navigator.permissions.query`. Inspeções passivas não abrem prompts. Bloqueio,
  indisponibilidade, demora do GPS, contexto inseguro e browser sem suporte têm
  mensagens próprias. Toques repetidos compartilham uma requisição e callbacks
  posteriores ao timeout não substituem seu resultado.
- Notificações respeitam instalação no iPhone, recusas anteriores e suporte do
  navegador. Permissão concedida sem registro confirmado no Core não é sucesso.
  Preferência importante/todas é preservada; falhas são anunciadas.
- Resumo apresenta pendências sem marcar recursos como ativados. Passageiro pode
  usar endereço manual e motorista pode acessar o perfil; a regra já existente
  de exigir localização para ficar online não foi removida.
- Ao voltar dos Ajustes, uma inspeção passiva reconsulta permissões. Há botão
  explícito de rechecagem, para navegadores cujo lifecycle não notifica o Flutter.

## Verificação e limites

Nove testes de widget cobrem ordem iPhone, PWA instalada, localização, recusa,
timeout, rechecagem, cadastro de push pendente, conclusão e toques repetidos.
Seis contratos por engine exercitam a bridge real em Chromium/WebKit com APIs
simuladas, sem provedores reais. O teste dos bundles compilados percorre todas
as telas antes de verificar recuperação da sessão e logout; gera screenshots
de instalação, localização, notificações e resumo dos dois apps/engines.

O fluxo não instala apps nem concede permissões sem confirmação. Nenhum teste
emula integralmente os Ajustes de um iPhone real ou comprova entrega FCM/GPS real.
O Core e a migration 085 não mudam neste release.

## Atualização controlada

O helper operacional `refresh-web-bundles.mjs` fixa ZIP/manifesto pelo hash,
verifica os dois bundles completos (incluindo metadados ocultos) e confirma
que não há mudança de Core/Caddy/Compose no commit do app. Só recria o gateway
com o mount dos bundles e atualiza o link permanente web-dist. Provedores e
serviços fora do gateway não podem mudar no preview. Os arquivos públicos
index/main.dart.js/bridge são comparados por SHA-256 após a publicação.
No Caddy ativo, separa a remoção de Server do bloco global de headers:
a remoção adiava o bloco inteiro, sobrescrevendo geolocation=(self) das PWAs
com geolocation=(). Um teste com Caddy real reproduz o problema e verifica
a correção nos dois escopos; o ADM continua sem GPS.

Falha restaura os pacotes anteriores com os mesmos overlays. Não há migration,
restart do Core, alteração do banco/site/ADM ou mudança financeira. O operador
executa o helper após enviar o ZIP aprovado. Logs/recibos ficam privados na VPS.
