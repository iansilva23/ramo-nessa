# Teste isolado antes da ativação Web

O operador confirmou `images-prepared.json`, imagem candidata e quatro serviços
saudáveis. A aplicação candidata continua sendo 5247aabd587efa610c9b4cc36d74cbc348048b41.

`test-web-isolated.py` valida o checksum do dump privado e restaura uma cópia
em um PostgreSQL descartável com `--network none`, sem portas publicadas.
Containers de execução compartilham apenas essa rede isolada, recebem uma senha
aleatória exclusiva do teste e não recebem configurações nem credenciais reais.
Nenhum servidor HTTP ou job de aplicação é iniciado.

O runner compilado da imagem candidata deve aplicar somente a 085. A segunda
execução não pode aplicar nada. O teste compara os 86 checksums anteriores,
verifica preservação de todos os registros push e o default `all`, exercita
cadastro/leitura/desativação Android/iOS pelo repositório compilado antigo e novo,
cadastro Web com preferência `important` e rejeição de provider/preferência inválidos.
O runner antigo também é executado no banco já atualizado.

O PostgreSQL usa a imagem preservada no backup. O Core novo é fixado pelo ID
registrado na preparação e o antigo pelo identificador preservado. Containers
ativos e Caddy são conferidos antes/depois. A cópia e seu volume anônimo são
removidos ao final. Logs privados não devem ser enviados ao chat sem seleção.
Sucesso gera `/var/backups/ramo-nessa-web/5247aabd587e/isolated-test.json`.

Isso verifica compatibilidade do esquema e dos repositórios de notificações,
não equivale a homologação completa de HTTP, autenticação, pagamentos, Maps,
FCM ou dispositivos. O código antigo não conhece preferências Web; um retorno
de versão requer retirar os clientes Web de circulação e rever a entrega de
notificações. Este teste não autoriza ativação nem remoção da migration.

A CI usa banco sintético vazio e compila as duas versões reais para exercitar
os runners e probes. O teste do dump da VPS é executado somente pelo operador.
