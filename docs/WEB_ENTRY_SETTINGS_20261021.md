# Controle da tela de deslizar nos apps Web

Em **ADM → Design dos Apps → Tela de entrada**, o proprietário pode marcar ou
desmarcar **Pedir para deslizar ao entrar** e salvar. O padrão inicial é desativado.
A opção atende Passageiro e Motorista Web instalados na tela inicial. Navegação
comum no Safari/Chrome continua sem a tela. A alteração aparece ao abrir ou retomar
o app; não gera APK/IPA e não modifica login, sessão, GPS, notificações ou preços.

O painel consulta o valor real do servidor; salvar exige a permissão de escrita
de Comunicação já usada por Design dos Apps. A revisão impede que duas abas ou
administradores sobrescrevam a última escolha. Erros e conflitos aparecem no card,
sem indicar sucesso quando a gravação falha. Tokens ficam nos headers existentes.

A migration 087 acrescenta somente três campos à linha existente de configurações
operacionais: valor booleano, revisão e data próprios. Não altera campos antigos,
catálogos, tarifas ou histórico. Reexecutar a migration não redefine a escolha.
A escrita e a auditoria (ator, data, antes/depois e revisão) são atômicas no banco.
O Core antigo pode conviver com as colunas extras; um retorno de código não deve
excluir as colunas nem restaurar banco antigo. Antes de iniciar o Core novo, aplicar
a migration pelo procedimento de implantação revisado.

A consulta pública retorna apenas `{enabled}` e não concede qualquer acesso
autenticado. O JavaScript da entrada consulta essa configuração sem credenciais,
cache ou armazenamento local de escolhas. Falhas, resposta inválida, endpoint
antigo ausente ou timeout de 1,5 s deixam a entrada direta. Uma resposta antiga
não pode reinstalar o bloqueio após uma nova retomada. Desativar libera somente
os elementos que a própria tela havia marcado como inertes, preservando controles
que já estavam bloqueados por outros motivos. A animação, gestos, teclado e leitor
de tela continuam disponíveis quando a opção é ativada.

Base: 7dece1706d617ea15ef3df2ab78310ca873762fe, posterior à busca Google
confirmada instalada pelo operador (731d524d). Flutter, mapas, buscas Google,
dependências, componentes de pagamento, Asaas, corridas e projetos nativos são
preservados. A comparação do ADM em app.js/api.js/index.html corresponde aos
hashes do inventário anterior da VPS. Nenhum serviço da VPS foi modificado no
desenvolvimento desta opção.

Verificações: testes de validação, autorização HTTP, estado inicial, auditoria e
concorrência; PostgreSQL isolado com migração repetida e falha de auditoria;
Chromium/WebKit para opção desativada/ativada, falhas do endpoint, controles,
retomada e layout do ADM; login/cookie/restauração/logout com o build Google
aprovado dos dois apps, sobrepondo somente o script da entrada.
Aceite no iPhone instalado permanece necessário após implantação autorizada.
