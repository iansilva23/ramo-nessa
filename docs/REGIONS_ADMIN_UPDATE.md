# Atualização da ajuda e coordenadas na homologação

`deploy/staging/update-regions-admin.mjs` instala a fonte aprovada `7efa18dc87da800d313357902316107029735666`. Exige root, Core em staging, catálogo gerenciado ativo, os cinco serviços esperados saudáveis e o ADM instalado igual à base auditada `e24a5ecb93e22b8054b599c4f377809fc63dcffb` (ou já igual à candidata).

## Escopo
- Somente imagem do Gateway/ADM. A candidata parte da imagem exata em execução e substitui os arquivos estáticos aprovados, preservando Caddy e seu ambiente de execução.
- Compara todos os arquivos estáticos instalados com Git e impede alterações fora de estilos, tela/controlador de Regiões e preços e dois módulos da ajuda. Não substitui trabalho desconhecido.
- Preserva o bind dos aplicativos Web, certificado/configuração Caddy, volumes, portas, redes, proteções e cada variável efetiva, inclusive dólares literais. O modelo de origem precisa ser JSON autocontido do rollout anterior.
- Nenhuma conexão SQL, migration, reset, publicação de catálogo, alteração de tarifa, chamada financeira ou atualização de Core/Passageiro/Motorista/nativos.
- Reutiliza o backup integral já verificado da etapa anterior. Guarda somente imagem anterior do Gateway, modelos de retorno, inventários e journal em diretório privado 0700/arquivos 0600; contém configurações privadas e não deve ser anexado ao PR/chat.

## Conferência e retorno
Antes da troca, verifica saúde/readiness, acesso financeiro protegido, site, fontes públicas do ADM, árvores dos apps Web, arquivos Caddy, identidades dos demais containers e modelo efetivo. Compila imagem nova com base local imutável, confere seu inventário completo e prepara retorno sem tocar nos serviços ativos.

Troca apenas Gateway com `--no-deps --no-build --pull never`, confere novamente todos os arquivos públicos do ADM (incluindo os módulos de ajuda/coordenadas), saúde, apps Web e serviços fora do escopo. Se falhar após a tentativa de troca, recupera a imagem anterior e confere o retorno. Mudanças concorrentes de imagem/configuração impedem sobrescrita automática e geram estado de conferência manual.

SIGINT/SIGTERM/SIGHUP solicitam recuperação nos pontos de controle. SIGKILL, queda da máquina ou perda de acesso ao Docker podem exigir recuperação manual pelos modelos/imagem registrados; não se promete retorno automático nesses casos.

Uma execução sobre a candidata já instalada apenas confere os arquivos públicos e informa `ADM_JA_ATUALIZADO`, sem reiniciar. A mensagem de sucesso `ADM_AJUDA_E_COORDENADAS_ATUALIZADOS` só é emitida após a conferência pública. Antes do retorno do operador, a atualização na VPS permanece pendente.

## Ensaio
O workflow `Regions Admin - Safe Help Update` usa Core e ADM reais da base auditada, Caddy, PostgreSQL 16 e dados sintéticos. Exercita sucesso/idempotência e falha após troca com retorno; compara a política pública e assinaturas de todas as tabelas públicas, incluindo tarifa configurada, corrida, pagamento e ledger. Os providers externos ficam desativados. Os testes de interface da fonte candidata já passaram separadamente em Chromium/WebKit e 1440/860/390 px.
