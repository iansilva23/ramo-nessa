# Acesso à Central do Motorista

Base de publicação: 96c8b3e98c930d8c94af45cefbfa98c08328a197.

No ADM, abra a aba **Central do Motorista**, bloco **Acesso à Central**.
Escolha o modo e use **Salvar acesso à Central**. Essa configuração tem efeito imediato e não depende da publicação das aulas.

| Modo | Entrada | Progresso |
| --- | --- | --- |
| Login individual do motorista | Conta existente no aplicativo | Servidor, por motorista |
| Login único para todos | Usuário e senha exclusivos da Central | Navegador de cada visitante |
| Acesso livre | Sem formulário de login | Navegador de cada visitante |

A primeira atualização mantém o login individual. Para criar o acesso compartilhado, defina usuário e senha com no mínimo 10 caracteres. Depois de criada, deixe a senha vazia para mantê-la. O ADM nunca devolve a senha ou seu hash. Salvar o acesso invalida as sessões compartilhadas anteriores. Essas credenciais não criam uma conta no aplicativo, não dão acesso ao ADM e não alteram o Core ou as regras financeiras.

O progresso local é compartilhado entre pessoas que usarem o mesmo perfil de navegador. Limpar os dados do navegador ou trocar de dispositivo não recupera esse progresso. O progresso individual já existente no servidor é preservado ao trocar os modos.

Segurança: hash scrypt com salt aleatório; sessões opacas de 24 horas, persistidas somente pelo hash; cookies Secure/HttpOnly/SameSite=Strict; limites persistentes de tentativas por IP e global; autorização administrativa com communications:write, validação de origem, tamanho e esquema; controle de revisão e auditoria sem credenciais.

## Publicação

Use `deploy/staging/publish-driver-training.mjs` com o SHA completo desta atualização. Ele reconhece a imagem da Central já publicada pelo ID da tag `training-96c8b3e98c93`, confere o editor ativo, preserva o snapshot Compose existente e cria backup SQLite e imagens para restauração antes de recriar somente o site e o gateway. Core, Postgres, Caddyfile e conteúdo publicado do site são conferidos antes/depois. Em falha de ativação, restaura as imagens anteriores automaticamente.

Não execute novamente uma revisão que já criou os diretórios de backup/release. Não use `--remove-orphans`.

## Validação

- Compilação de produção e TypeScript.
- Suíte unitária do site, incluindo limites persistentes, rotação e expiração de sessões, configuração e credenciais.
- HTTP contra servidor de produção isolado: autenticação individual e compartilhada, acesso livre, CSRF, autorização do ADM, conflitos de revisão, logout, publicação e progresso.
- Regressão HTTP do gerenciamento do site e formulário de interessados.
- Testes do publicador, preservação do Compose e recuperação de erros transitórios.
- Cenários de navegador disponíveis em `test/driver-training-http.mjs` quando PLAYWRIGHT_MODULE/CHROMIUM_PATH estiverem configurados. Execução visual indisponível neste ambiente: Chromium local ausente e download bloqueado pela rede. Nenhuma validação visual é declarada como concluída.
