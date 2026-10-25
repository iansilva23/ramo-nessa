# Instalação web de Atividades — PR #67

Pacote próprio para a implementação revisada `c05e3b82949ab22963ac9018b3834d8e7c46060d`. Não reutiliza os binários de recuperação forçada do PR #62. O workflow de empacotamento verifica que backend, aplicações, design system e configuração pública continuam nessa revisão.

## Base e preservação

- Core anterior: revisão financeira `25d429e11b282be8832538ebd11d41123526fd5a`, fingerprint compilado `591fa41486d42bcc68ee2f4f3f625bd6d749e9869af75afcb811c6c28ea8562e`.
- Web anterior: `/opt/ramo-nessa-web/releases/driver-responsive-b5c44292ff76/bundles`.
- Verifica os arquivos administrativos, Caddy e configurações efetivamente em uso. Uma base diferente interrompe a operação antes da troca.
- Faz backup do banco, documentos, arquivos, configuração e imagens. O banco é restaurado para teste em PostgreSQL isolado, sem rede de provedores, antes da ativação.
- Sobrepõe apenas o delta compilado revisado ao Core e ADM atuais. Não troca dependências, credenciais, catálogo comercial, domínios, configuração de pagamentos ou serviços alheios.
- Migrações 094 e 095 são aditivas e verificadas por checksum, na mesma transação. Aceita 094 já instalada, inclusive com checkout persistido; não esvazia tabelas de recuperação, chamados, documentos, eventos ou pagamentos. Política de embarque deve permanecer desativada.
- A atualização abrange Passageiro web, Motorista web, ADM e Core. Nenhum pacote Android/iOS é gerado.

## Ensaio obrigatório antes da publicação

O workflow `ride-activities-web-package.yml` compila a base e o candidato, gera os dois bundles configurados, valida login/cookie/reabertura e a seleção explícita da corrida em Chromium e WebKit. A API é simulada nesses testes; nenhuma cobrança real é feita.

O ensaio Docker usa Core anterior, PostgreSQL e Caddy reais em rede interna. Testa restauração isolada dos backups, rejeição de mudanças concorrentes de configuração, falha após Core, falha após Web, desaparecimento do Gateway e preservação do Core quando há adoção de estado novo. Exercita um Pix persistido deixado pela tentativa anterior, recuperação autenticada após recriar o Core e chamado contextual com isolamento entre passageiros.

A publicação da release `ride-activities-web-20261025-r2` depende do sucesso desse ensaio. Os arquivos são `RamoNessa-Atividades-Web.zip` e `Instalador-Atividades-Web-r2.tar.gz`, acompanhados de SHA-256.

## Ativação e retorno

Executar o instalador publicado com `install`, caminho absoluto do ZIP e SHA-256 verificado. A instalação mantém os serviços existentes durante preparação e backup; a troca de Core e Gateway é sequencial e verificada. Falhas na ativação acionam o retorno ensaiado, preservando o banco.

Ao concluir, o recibo `ATIVIDADES_WEB_ATUALIZADAS` inclui `rollback.command`, que fica disponível em pasta privada estável na VPS, independentemente da pasta temporária de download. O retorno explícito troca Web e, se não houve adoção de registros novos, Core. Havendo registros novos, mantém o Core compatível e devolve a Web anterior. Nunca restaura dump por cima de pagamentos ou corridas recentes. Mudança posterior da política de embarque impede um retorno incompatível.

Depois da instalação, a aceitação funcional ainda deve conferir os dois aplicativos web: Início disponível ao reabrir, Atividades com a mesma corrida, mesmo pagamento/Pix, retomada no motorista e Ajuda vinculada ao chamado visível no ADM.

## Correção r2 após consulta da VPS

A tentativa r1 parou em `ACTIVITIES_WEB_BASE_CHANGED` antes de backup, migração ou troca de serviços. A consulta do responsável confirmou a Web em `driver-responsive-b5c44292ff76/bundles` e o mesmo Caddy SHA-256 `23007273d7b9939333a91ff72419f1761adaf63f269433e0aa0eb8d9336eff46`. A r2 fixa esse caminho real e conserva as demais verificações.

A preparação vazia deixada pela recusa anterior pode ser reutilizada somente quando é uma pasta privada de root, sem links e sem nenhum arquivo. Planos, journals ou qualquer outro conteúdo continuam impedindo sobrescrita. O ensaio reproduz essa recusa, comprova que nenhuma migração ou reinício aconteceu, testa a proteção de uma preparação não vazia e repete instalação e retorno a partir da pasta vazia.

O ZIP de aplicação é o mesmo da r1, já testado nos dois navegadores: SHA-256 `a4033228493d9ebe5612631f5e7c56f5656aa786b2b068b1ab3d31464240b45b`. Apenas o instalador é corrigido. A publicação r2 depende de novo ensaio completo do instalador sobre esse ZIP, sem recompilar ou alterar os aplicativos.
