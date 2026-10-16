# Preparação das imagens Web na VPS

Candidato e artefato configurado: 5247aabd587efa610c9b4cc36d74cbc348048b41.
O operador confirmou em 15/10/2026 que o backup em
/var/backups/ramo-nessa-web/5247aabd587e concluiu verificação, restauração isolada,
snapshot SQLite íntegro e preservação das quatro imagens, configurações e fonte.
O comando não aplicou 085 nem reiniciou os serviços.

## Artefato

Workflow 38834252878 aprovado; artefato 12018786393, nome
ramo-web-configured-5247aabd587efa610c9b4cc36d74cbc348048b41.
ZIP SHA-256: ba52587885814a0d12dbb4508132ed6d20d5c63d030b05b4a72bd5b52717c034.
O operador copia o ZIP original para /home/ubuntu/RamoNessa-Web-5247aabd587e.zip.
Não usar os dois artefatos review separados ou inserir chaves manualmente no HTML.

O upload-artifact original omitiu quatro arquivos ocultos: .last_build_id dos
dois apps e dois .gitkeep do Passageiro. Não são carregados pela aplicação.
O preparador aceita APENAS essas quatro ausências, com caminho/tamanho/hash do
manifesto original fixados no código, e verifica todos os arquivos de execução.
Nenhum JS, HTML, WASM, imagem, config Maps/Firebase ou fonte é modificado.
O SHA do ZIP e do release.json original são obrigatórios; dados extras,
symlinks, traversal, arquivos ausentes de runtime e hashes divergentes bloqueiam.
Os hashes da árvore de origem no manifesto também são conferidos.
bundle-verification.json registra explicitamente os metadados omitidos.
A configuração do upload futuro foi corrigida para incluir arquivos ocultos
após a checagem estrita de conteúdo privado já existente.

## Preparar

prepare-web-images.mjs verifica novamente o inventário/backup, hashes das
configurações privadas e identidades dos containers. Extrai somente fonte Git
do candidato em /opt/ramo-nessa-web/releases/5247aabd587e/source, valida/estagia
o ZIP e executa o gate Node dos dois bundles com Firebase real, sem provedores.

Constrói ramo-nessa-core:web-5247aabd587e sem substituir a tag staging ou containers.
O gateway atual já contém o ADM/site aprovados: sua imagem é preservada e
reutilizada; não há motivo para substituir o frontend do ADM.
O novo fragmento PWA é inserido no Caddyfile ATUAL, mantendo todos os bytes fora
desse fragmento. O candidato é validado em container Caddy descartável sem rede.

A configuração Compose de prévia usa os mesmos helpers e overlays privados
sem imprimir config/credenciais; compara ambiente/volumes do Core, PostgreSQL
inteiro e ambiente do gateway com o baseline. A prévia só acrescenta a imagem
candidata e a montagem /srv/web. Não executa up, start ou migrate.
Registra images-prepared.json no diretório privado de backup; guarda hashes,
imagem candidata, configuração e identidades para a próxima etapa.

Ainda será necessário validar Core/migration/compatibilidade em ambiente
isolado e preparar ativação coordenada. A aplicação da 085 e publicação Web
não ocorrem nesta preparação. Não usar start.mjs como atalho nem alterar preços,
pagamentos, OTP ou o site. Não apagar preparações parciais para forçar repetição.
