# Site e aplicativos

Módulo em `/administrodo/site-aplicativos`, integrado à sessão humana existente do Core. A cada requisição o site valida o Bearer em `GET http://core:8080/v1/admin/auth/me`, sem cache, sem credenciais próprias e sem acesso ao PostgreSQL.

Permissões reutilizadas: `drivers:profile:read/write` para interessados; `communications:read/write` para conteúdo, arquivos e publicação. Senha/MFA e revogação continuam no Core. Mutações exigem a origem administrativa configurada. Não há envio automático de WhatsApp ou ativação automática de motorista.

O banco SQLite e o volume `ramo-nessa-site_interests` existentes são preservados. As tabelas de acompanhamento, rascunho, versões, auditoria e arquivos são aditivas. Registros anteriores aparecem como novos por LEFT JOIN. Histórico guarda ator, ação, alvo e data; observações/telefones não vão para o endpoint público ou logs.

## Edição

Título/destaque/descrição principal, chamada para motoristas, chamada dos downloads, foto principal/descrição acessível/créditos, ícones passageiro/motorista. Cada app tem versão, URL APK, web, Google Play e App Store. Campos vazios mantêm as opções em breve. Não é um editor de HTML ou de layout. A prévia mostra o conteúdo no próprio painel; não reproduz todas as animações do site.

Salvar não publica. Publicar exige rascunho salvo e confirmação. Recuperar uma versão anterior só muda o rascunho. Conflitos retornam 409 e exigem recarregar os dados. Texto é renderizado como texto, nunca HTML. URLs externas exigem HTTPS sem usuário/senha. Imagens vêm do upload local, sem SVG.

Uploads: PNG/JPEG/WebP até 8 MiB; APK até 150 MiB, enviado por streaming e identificado por SHA256. O APK deve conter AndroidManifest.xml no diretório ZIP; essa verificação não certifica assinatura, autoria ou segurança do APK. O operador deve enviar o build assinado e aprovado. Arquivos nunca são executados. Rascunhos são privados; mídia publicada tem suporte a Range. Novos APKs não atualizam automaticamente instalações existentes. O volume guarda uploads e versões para recuperação; acompanhar espaço em disco, sem limpeza automática que possa quebrar versões anteriores.

## Atualização da VPS

Os scripts são específicos para o estado conhecido desta instalação. Faça fetch da branch `feature/site-admin-20261015`, use o SHA completo da revisão e execute `prepare-site-admin.mjs SHA` como root. A preparação verifica os arquivos locais do ADM, preserva o Caddyfile completo, constrói imagens separadas e valida a configuração. Não troca containers. O primeiro erro interrompe; não remova os guardas para forçar.

Depois da preparação, `activate-site-admin.mjs SHA` valida novamente arquivos/containers, usa os helpers existentes para carregar as credenciais privadas sem imprimir, faz backup SQLite consistente e troca somente site e gateway. Core e Postgres permanecem com as mesmas identidades. As rotas `/site-management/*` e `/media/*` no host do ADM apontam ao site. A configuração do domínio público existente é preservada integralmente. Fonte local do módulo é sincronizada, sem mudar branch/HEAD ou descartar alterações locais.

Backups de preparação e rollback ficam em `/var/backups/ramo-nessa-site-admin/REVISAO_CURTA/`; backup SQLite no volume do site em `backups/`. Em falha, restaura imagens, fonte e Caddyfile. Não restaura o banco automaticamente, evitando perder novos interessados; o esquema é aditivo. Não executar `down -v` ou exclusão do volume.

## Validação realizada

TypeScript, build Next standalone, testes unitários de autenticação/escopos/origem, armazenamento, conflitos, rascunho/publicação/restauração, upload e contrato original. Integração HTTP real com Core simulado: formulário → acompanhamento → publicação → restauração; sessão revogada; privacidade; mídia privada/pública e Range. Regressão do ADM e teste do módulo com DOM simulado. Os testes usam bancos temporários e não geram contatos na VPS.

Sem Docker ou navegador real neste ambiente: build da imagem/validação Caddy na VPS e aceite visual/login no navegador continuam necessários. As verificações automáticas não substituem esse aceite. Nenhuma alteração remota de containers foi executada pelo assistente.
