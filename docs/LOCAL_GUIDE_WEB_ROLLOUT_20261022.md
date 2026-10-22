# Guia Local — atualização prioritária do Web

## Escopo autorizado

Passageiro Web, ADM e APIs/tabelas do Guia Local. O Web do motorista é copiado byte a byte da release ativa; não é compilado ou atualizado. Android/iOS ficam para a etapa posterior. Não há merge na main.

Aplicativo: fonte já testada `9f294f81fe6dad56ffd46edf0482ab947347c36a`, sem alterações nesta etapa operacional. PR de implementação #39; preparação operacional no PR DRAFT #40.

## Inventário recebido da VPS

Leitura fornecida pelo operador em **22/10/2026 às 14:15:51, horário de Fortaleza**:

- Core: `sha256:8020dd70b5aeb81ddd857f28293c475cc50f6d4708588a8963d7d20223b462be`.
- 236 módulos JS, assinatura `28d8faa762d6da73c3a7bf0fa26f1fbe6e653cf9aa202be7c268d9f45aba5509`.
- Lock Core: `3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e`.
- Gateway: `sha256:72c5f3b8fb7152673823fa968bf0d79e623805b2449d5faab3d78b7c8afd8cd6`.
- Web: `/opt/ramo-nessa-web/releases/direct-2c8963b2a0a6/bundles`.
- Catálogo publicado 81: 41 localidades, 14 tarifas; assinatura `d8da5c2a75ec88780de1226063ca08b563bf2b9d38004e012936b97d9b191b30`.
- Histórico de migrations até 086, com checksums; 087 ainda ausente.

A compilação local da base 731d524d reproduziu a assinatura do Core e as cinco assinaturas do ADM do inventário. A candidata possui 239 módulos JS, assinatura `d01f2d7ff7eeec566de2577c56f226d2f51d43091f5dc7c399d86f913f9c4241`. O pacote recusa qualquer delta compilado fora de server.js, db/repositories.js e dos três módulos guide; dependências e migrations anteriores permanecem iguais.

## Pacote e configuração

O workflow compila somente Passageiro Web com `RAMO_PREVIEW_MODE=false`, Core da mesma origem e recursos locais do Flutter. Reutiliza a configuração pública Maps/Firebase existente e verifica manifesto, ícones, bootstrap, ponte de cartão e ausência da tela antiga de deslizar. As chaves privadas da VPS nunca são incluídas no pacote.

O pacote contém o Web configurado, dez arquivos do patch compilado Core (JS/map), sete arquivos do ADM, a migration 087 e um manifesto com hashes por arquivo. Os componentes existentes de backup, Compose, validação de ambiente, assinaturas e retorno são reutilizados.

O ZIP é disponibilizado como pacote de instalação GitHub somente depois de aprovados os testes. Essa disponibilização não implanta serviços. A VPS recebe o ZIP por URL pública fixa, com SHA-256 fixado no comando de instalação; não exige download manual ou token GitHub adicional.

## Preparação e ativação

`local-guide-web-update.mjs install /caminho/local-guide-web.zip SHA256` executa:

1. Confere imagens, assinaturas, catálogo, histórico, configurações ativas e integridade do pacote; divergências impedem sobreposição.
2. Cria backup de banco, configurações, documentos, Web e imagens pelo mecanismo existente. Restaura o banco em PostgreSQL isolado, sem rede, e verifica o backup antes de prosseguir.
3. Deriva imagens do Core/Gateway realmente ativos com somente os arquivos revisados. Preserva ambiente literal, volumes, rede, comandos e proteções. Prepara a Web em nova pasta, mantendo a release anterior.
4. Aplica somente 087 em transação, com lock de migrations e conferência de checksums. Compara os passeios antes/depois. Nenhum cadastro original é excluído ou atualizado pela migration.
5. Troca Core, verifica saúde e assinatura, depois troca ADM/Web. Confere bytes HTTP, APIs pública/administrativa, Maps/Firebase, motorista, catálogo e serviços protegidos.

Os serviços PostgreSQL, mapas auxiliares e site não são reiniciados. O ambiente ativo de Mercado Pago/Asaas e demais provedores é reaproveitado, não reconstruído a partir de configurações antigas do checkout.

Em falha de troca, o retorno restaura ADM/Web antes do Core. **Não restaura banco financeiro antigo e não apaga as tabelas aditivas do Guia.** O script informa retorno confirmado apenas após verificá-lo; mudança concorrente ou falha na recuperação resulta em `requires-review` no registro privado.

O diretório operacional é `/opt/ramo-nessa-local-guide/9f294f81fe6d`. A preparação registra hashes e modelos privados; a ativação registra sua fase em `activation.private.json`. Um procedimento iniciado não é repetido cegamente. Não enviar arquivos de configuração ou logs privados que possam conter credenciais.

## Testes

- Verificações locais: 20 testes Node de argumentos, escopo, ambiente literal, ordenação e falhas de retorno passaram; dois testes Python de extração/checksum/traversal/duplicatas passaram.
- O workflow executa sessões do Web compilado em Chromium e WebKit (abertura instalada, retorno, login, cookie e logout).
- O ensaio Docker usa Core anterior real, PostgreSQL e Caddy, com credenciais sintéticas e rede isolada. Exercita backup/restauração, catálogo 81 sintético, passeio/foto existentes, migration aditiva, configuração concorrente, falha após Core, falha após Web, retorno e atualização completa por HTTP. Compara as linhas anteriores de dados, o motorista, ambiente com cifrões e serviços protegidos.
- Execução final aprovada: https://github.com/iansilva23/ramo-nessa/actions/runs/39825576197, revisão operacional `d7ed38577a6d9bb1040ede952cd99d6a2ad690ed`. Os dois jobs (pacote/ensaio e disponibilização do ZIP) concluíram com sucesso.
- 20 testes Node e dois testes Python aprovados; sessões do Web compilado aprovadas em Chromium e WebKit. O ensaio real executou três backups verificados com restauração isolada, bloqueio de configuração concorrente, duas falhas provocadas com retorno confirmado e instalação final por HTTP. A migration permaneceu aditiva e os dados anteriores, ambiente literal, catálogo e motorista foram comparados e preservados.
- Release do pacote: https://github.com/iansilva23/ramo-nessa/releases/tag/local-guide-web-9f294f81
- ZIP com 18.573.561 bytes e 72 arquivos de payload: `bc893ebde3cf0c9d0d542d4fc2bdc4aa49f0741fc2cf0ae57c86c6cb5ed07aba`.
- Evidências de sessão: https://github.com/iansilva23/ramo-nessa/actions/runs/39825576197/artifacts/12446104778
- A instalação na VPS ainda depende da execução do comando abaixo pelo operador. Os testes de CI não são declarados como implantação real.

## Conferência pelo responsável após instalação

Aguardar `GUIA_LOCAL_WEB_ATUALIZADO`, fechar e reabrir o Passageiro Web e acessar Guia Local. No ADM, abrir Guia Local pela entrada única e conferir os passeios já cadastrados. Os demais modelos iniciais ficam em rascunho até receberem conteúdo/capa e publicação pelo responsável; não foram publicados estabelecimentos/eventos ilustrativos.

Testar no Safari/Chrome real: login existente, troca de localidade, passeio com foto, WhatsApp/Instagram e destino no mapa com cotação. A ação de rota não solicita corrida automaticamente. O aceite em aparelho físico e com provedores reais continua necessário; o ensaio isolado não o substitui.

## Comando revisado de instalação

Executar na VPS como ubuntu, com sudo. O fetch não altera o checkout ativo. O instalador recebe a revisão operacional testada e o hash exato do ZIP disponibilizado. Aguardar a conclusão e guardar a saída.

```bash
bash <<'ATUALIZAR_GUIA_WEB'
set -euo pipefail

git -C /opt/ramo-nessa fetch origin \
  ops/local-guide-web-20261022

preparo_guia=$(mktemp -d /tmp/ramo-guia-web.XXXXXX)
git -C /opt/ramo-nessa archive \
  d7ed38577a6d9bb1040ede952cd99d6a2ad690ed deploy/staging |
  tar -x -C "$preparo_guia"

curl --fail --show-error --location \
  'https://github.com/iansilva23/ramo-nessa/releases/download/local-guide-web-9f294f81/local-guide-web.zip' \
  --output "$preparo_guia/local-guide-web.zip"

sudo node "$preparo_guia/deploy/staging/local-guide-web-update.mjs" \
  install "$preparo_guia/local-guide-web.zip" \
  bc893ebde3cf0c9d0d542d4fc2bdc4aa49f0741fc2cf0ae57c86c6cb5ed07aba
ATUALIZAR_GUIA_WEB
```

Sucesso esperado: `GUIA_LOCAL_WEB_ATUALIZADO`. Em erro, guardar a mensagem e consultar a fase do registro; não repetir o instalador nem executar comandos genéricos de reset/atualização. As versões antigas, o banco aditivo e o backup são mantidos.

## Correção de preparação após a tentativa na VPS

Em 22/10, o backup da VPS foi restaurado em isolamento e verificado, mas a preparação falhou com `EACCES` ao ler `/app/dist/src/guide/guide-routes.js` na imagem candidata. Não existiam plano preparado nem registro de ativação; Core/Gateway anteriores continuavam saudáveis. A instalação não foi concluída.

O instalador agora define explicitamente a pasta nova de código como 0755 durante a construção e restaura `USER node` antes de verificar a imagem. Os arquivos continuam 0644, e a comparação completa da configuração da imagem permanece obrigatória. As pastas públicas da cópia Web também recebem permissões explícitas; configurações, planos e backups privados continuam protegidos.

O modo `recover-install` aceita somente esta falha de preparação, sem plano/ativação existentes, pacote com SHA válido e serviços/imagens/catálogo anteriores intactos. Preserva as duas pastas incompletas com sufixo de auditoria e prepara novamente com backup verificado. Não exclui arquivos nem restaura dados financeiros.

O ensaio de regressão usa o ZIP público original com SHA `bc893ebde3cf0c9d0d542d4fc2bdc4aa49f0741fc2cf0ae57c86c6cb5ed07aba`, força a mesma falha real de leitura no usuário restrito e testa a retomada. A publicação automática do pacote foi desabilitada nesta rodada para preservar o release imutável. O resultado deste novo ensaio será registrado após a execução; a homologação anterior não comprova esta correção.
