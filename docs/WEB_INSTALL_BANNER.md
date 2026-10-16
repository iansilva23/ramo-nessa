# Entrada Web e instalação opcional

Nos apps Web de passageiro e motorista, o conteúdo autenticado abre imediatamente. O assistente obrigatório de instalação, GPS e notificações é substituído por uma faixa amarela opcional no topo.

A faixa respeita a área segura do aparelho, reserva espaço acima do conteúdo e pode ser fechada durante a sessão. Sua aparição e fechamento não recriam o estado da tela do app. Em modo standalone ou com instalação confirmada, a faixa fica escondida. A leitura de instalação é passiva: falhas ou lentidão não bloqueiam o app.

O toque na faixa tenta o prompt nativo disponível no navegador. No iPhone ou sem prompt disponível, apresenta instruções manuais. Uma escolha `accepted` ainda não é tratada como instalação concluída. O tutorial em vídeo será incluído quando houver material aprovado; esta versão utiliza instruções escritas.

A faixa não pede GPS/push, não grava conclusão do assistente e não altera preferências de notificações. Localização continua nos recursos do mapa e na disponibilidade do motorista. A ativação de notificações permanece em Perfil → Notificações. O fluxo de onboarding dos binários Android/iOS continua separado e não é modificado por esta entrega.

## Verificação

- Widgets: entrada imediata, armazenamento dispensável, falha de snapshot, modo instalado para ambos os papéis, instruções manuais, fechamento, instalação pendente versus confirmada, bloqueio de toque duplicado e preservação do estado do app.
- Jornadas compiladas: login, faixa e ajuda, fechamento, restauração da sessão por cookie e logout, em Chromium e WebKit com provedores simulados.
- Os testes usam mapas/provedores de teste; não constituem aceite de Maps, push real ou instalação em um iPhone físico.
- Esta entrega não declara corrigido o desalinhamento de toque relatado no modo Tela de Início do iPhone.

## Publicação

A preparação operacional exige a atualização anterior 78750ebeebd9 confirmada, o mount esperado e o Caddy exato do registro anterior. O novo atualizador preserva o Caddy byte por byte, inclusive a política de GPS já corrigida. Só o mount dos pacotes Web do gateway é trocado, mantendo a imagem do gateway; Core, banco, site e demais configurações não são atualizados.

O pacote configurado é verificado por SHA-256 do ZIP, manifesto e arquivos. O rollback operacional usa os pacotes anteriores sem restaurar banco e sem executar migrations.
