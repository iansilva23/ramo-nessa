# Instalação web de Atividades — PR #67

Pacote próprio para a implementação revisada `c05e3b82949ab22963ac9018b3834d8e7c46060d`. Não reutiliza os binários de recuperação forçada do PR #62. O workflow de empacotamento verifica que backend, aplicações, design system e configuração pública continuam nessa revisão.

## Base e preservação

- Core anterior: revisão financeira `25d429e11b282be8832538ebd11d41123526fd5a`, fingerprint compilado `591fa41486d42bcc68ee2f4f3f625bd6d749e9869af75afcb811c6c28ea8562e`.
- Web anterior: `/opt/ramo-nessa-web/releases/ride-identity-e36963c02716/bundles`.
- Verifica os arquivos administrativos, Caddy e configurações efetivamente em uso. Uma base diferente interrompe a operação antes da troca.
- Faz backup do banco, documentos, arquivos, configuração e imagens. O banco é restaurado para teste em PostgreSQL isolado, sem rede de provedores, antes da ativação.
- Sobrepõe apenas o delta compilado revisado ao Core e ADM atuais. Não troca dependências, credenciais, catálogo comercial, domínios, configuração de pagamentos ou serviços alheios.
- Migrações 094 e 095 são aditivas e verificadas por checksum, na mesma transação. Aceita 094 já instalada, inclusive com checkout persistido; não esvazia tabelas de recuperação, chamados, documentos, eventos ou pagamentos. Política de embarque deve permanecer desativada.
- A atualização abrange Passageiro web, Motorista web, ADM e Core. Nenhum pacote Android/iOS é gerado.

## Ensaio obrigatório antes da publicação

O workflow `ride-activities-web-package.yml` compila a base e o candidato, gera os dois bundles configurados, valida login/cookie/reabertura e a seleção explícita da corrida em Chromium e WebKit. A API é simulada nesses testes; nenhuma cobrança real é feita.

O ensaio Docker usa Core anterior, PostgreSQL e Caddy reais em rede interna. Testa restauração isolada dos backups, rejeição de mudanças concorrentes de configuração, falha após Core, falha após Web, desaparecimento do Gateway e preservação do Core quando há adoção de estado novo. Exercita um Pix persistido deixado pela tentativa anterior, recuperação autenticada após recriar o Core e chamado contextual com isolamento entre passageiros.

A publicação da release `ride-activities-web-20261025-r1` depende do sucesso desse ensaio. Os arquivos são `RamoNessa-Atividades-Web.zip` e `Instalador-Atividades-Web-r1.tar.gz`, acompanhados de SHA-256.

## Ativação e retorno

Executar o instalador publicado com `install`, caminho absoluto do ZIP e SHA-256 verificado. A instalação mantém os serviços existentes durante preparação e backup; a troca de Core e Gateway é sequencial e verificada. Falhas na ativação acionam o retorno ensaiado, preservando o banco.

Ao concluir, o recibo `ATIVIDADES_WEB_ATUALIZADAS` inclui `rollback.command`, que fica disponível em pasta privada estável na VPS, independentemente da pasta temporária de download. O retorno explícito troca Web e, se não houve adoção de registros novos, Core. Havendo registros novos, mantém o Core compatível e devolve a Web anterior. Nunca restaura dump por cima de pagamentos ou corridas recentes. Mudança posterior da política de embarque impede um retorno incompatível.

Depois da instalação, a aceitação funcional ainda deve conferir os dois aplicativos web: Início disponível ao reabrir, Atividades com a mesma corrida, mesmo pagamento/Pix, retomada no motorista e Ajuda vinculada ao chamado visível no ADM.
