# Ativação coordenada de homologação

O operador confirmou o teste do dump real: migration 085, preservação dos
registros de notificações, probes Android/iOS/Web e repositório antigo aprovados.
Confirmou também Core e Compose sem mudanças locais e `web-dist` inexistente.

`activate-web-staging.mjs --prepare` apenas produz um plano privado revisável.
Confere novamente containers, imagens, Caddy, arquivos privados preservados,
histórico de migrations, código limpo do Core/Compose e hashes dos bundles
contra uma extração nova do ZIP aprovado. Valida Caddy offline. O plano inclui
os bytes anteriores e novos dos 21 arquivos adicionados/modificados do Core,
Caddy e Compose. Não descarta alterações existentes do ADM/site.

Somente `--activate`, após autorização do operador para esse escopo, executa:

1. Backup recente do banco/documentos usando o helper original verificado.
2. Runner compilado da imagem fixada: somente a 085 pode estar pendente.
3. Sincronização dos arquivos revisados do Core sem mudar HEAD/branch.
4. Mount permanente `web-dist` para os dois bundles aprovados; tag staging do
   Core passa a referenciar a imagem aprovada para futuras operações normais.
5. Recriação somente de Core e gateway, com `--no-deps --no-build --pull never`.
   Todos os overlays de Firebase, Maps e OTP e seu ambiente validado são usados.
6. API ready, ADM, site e duas PWAs precisam responder HTTPS 200. Variáveis
   gerenciadas do Core são comparadas com as anteriores. Site/Postgres não podem
   ter seus containers substituídos.

Há breve indisponibilidade durante a troca do Core/gateway. O plano padrão não
ativa nada. O teste de esquema não certifica login/FCM/Maps/pagamentos reais.
Links públicos do site continuam como estavam até o aceite nos aparelhos.

## Falha e retorno

O registro `activation-started.json` bloqueia repetições automáticas. Em falha
antes de expor rotas Web, imagens/fontes/configurações anteriores são restauradas,
mantendo a migration 085 compatível. Não há down migration nem restauração de
dump, exclusão de dados ou troca de modo/chaves financeiras.

Se as rotas novas já foram expostas, o retorno automático restaura somente o
Caddy anterior, fechando as rotas Web, e conserva o Core novo. Assim não se troca
para um binário que ignora preferências de notificações já registradas. Qualquer
retorno posterior do Core exige análise específica. Um erro nessa recuperação
é anunciado como retorno incompleto; operador deve enviar a mensagem sem repetir
ativação ou compartilhar logs privados completos.

O roteiro histórico RAMO_NESSA_WEB_ROLLOUT.md exige autorização explícita de
Core/gateway/bundles/migration antes de executar a ativação. A preparação do
plano é necessária e não corresponde a essa autorização.
