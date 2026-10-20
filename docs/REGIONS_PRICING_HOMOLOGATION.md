# Homologação — Regiões e preços

## Entrega e limites
A gestão nova substitui a navegação fragmentada por uma única área com quatro abas. O motor continua autoritativo no Core e usa o mesmo histórico de catálogos.
Precedência: tarifa fixa válida → regra por quilômetro válida → indisponível.
Não há valores comerciais previamente carregados no catálogo preparado. Valores encontrados em testes e capturas são exclusivamente sintéticos.

Esta branch não publica serviços. Ela não executou limpeza, migração de dados reais, repasses ou cobranças. O catálogo legado permanece efetivo até preparação e rollout especificamente autorizados.

## Preparação do catálogo
O script backend/core/scripts/prepare-regions-catalog.ts é uma ferramenta operacional separada das migrations.
- --plan ARQUIVO: somente leitura; exporta snapshot anterior, referência imutável, digest e inventário de dependências. Arquivo exclusivo 0600 em pasta privada.
- --apply-plan ARQUIVO: só aceita checksum SHA-256 do plano conferido e --confirm three-regions-empty-fares-20261020. Exige proprietário humano ativo e configuração original inalterada.
- Uma única transação cria snapshot com Jeri, Jijoca (sede) e Preá, mantém categorias e remove tarifas operacionais. Nenhuma tabela financeira ou corrida é apagada.
- Reexecução reconhece o identificador da preparação e não apaga tarifas cadastradas posteriormente.
- --restore-plan ARQUIVO: exige checksum, revisão atual explícita e --confirm RESTORE_PRICING_CATALOG. Restaura a configuração anterior como nova versão; mantém todo o histórico intermediário.
- A aplicação e a restauração dependem de autorização do proprietário e de inventário/backup atual do ambiente. Não executar por inferência a partir deste documento.

O plano de catálogo não substitui backup integral do PostgreSQL e material de retorno das imagens/Gateway. Não há rollback automático de banco.

## Funcionalidade a homologar no ambiente autorizado
1. Conferir a área Regiões e preços no ADM, com três regiões e zero tarifas após a preparação aprovada.
2. Criar região pelo mapa, pesquisar local, definir município/estado e raio, selecionar categorias e salvar.
3. Cadastrar tarifa fixa e por km para a mesma rota/categoria; conferir prioridade da fixa.
4. Conferir dias/noites sem fallback automático. Um período não configurado permanece indisponível.
5. Comparar cotação Web e preparação de corrida com distância Google real. Testes de CI usam provider sintético.
6. Confirmar categoria sem motorista compatível, nenhuma tarifa, região arquivada e limites sobrepostos.
7. Alterar tarifa ativa com senha/MFA; validar dois administradores e tentativa de edição desatualizada.
8. Validar reserva/oferta/aceite/pagamento em sandbox autorizado, cancelamento e reembolso, sem repasse real.
9. Aceitar interface no Safari de iPhone e Chrome de Android, além de computador/tablet. Playwright WebKit não equivale a iPhone real.
10. Somente após aceite Web, planejar sincronização e testes nativos; nenhum APK/IPA é atualizado nesta fase.

## Categorias
Os cinco adapters operacionais existentes são preservados. Nome/descrição/ícone das categorias suportadas são consumidos pela versão Web.
Novos IDs podem ser cadastrados desativados. O servidor rejeita sua ativação enquanto não houver adapter de operação e suporte real dos aplicativos/veículos/motoristas. Não se afirma suporte irrestrito a tipos novos.
O requisito 4x4 para carros em Jericoacoara é preservado e validado no servidor.
Tarifas são associadas a regiões circulares; um ponto específico pode ser representado por uma cobertura pequena, com raio mínimo de 50 metros.

## Evidências
A execução do workflow Regions and Pricing - Web Review verifica:
- Core: tipagem, testes e build, com guardas de integridade financeira/nativa.
- ADM: sintaxe, testes de API, moeda, navegação e integridade.
- PostgreSQL 16 descartável: exclusividade de gravação, auditoria atômica, histórico, conflito e rollback por falha.
- Web Passageiro/Motorista: análise, testes e compilação; teste específico do catálogo em Chrome.
- Chromium/WebKit: controlador real, API HTTP, autenticação/senha/MFA, assistente, tarifa, simulação, arquivamento/recuperação e overflow em 1440/860/390 px.
As capturas usam dados sintéticos e tiles substituídos. Não comprovam Google Maps, GPS ou provedores reais. Bundles de revisão apontam para example.invalid e não são pacotes conectados à VPS.

## Limites de implantação e aceite real
- Os dois relatórios reais do operador foram recebidos. O Core corresponde à referência financeira anterior e os cinco arquivos do ADM à base V5. O catálogo ainda é legado. Backup/restauração e ativação continuam separados do diagnóstico.
- Android/iOS não foram compilados, atualizados ou testados em aparelhos. Os diretórios nativos e o comportamento legado permanecem preservados nesta branch.
- Clientes nativos já instalados não foram homologados com managedOperations. Esse modo exige coordenadas e sessão na cotação. Não ativar em backend de produção compartilhado sem definir e validar a compatibilidade dos clientes existentes após o aceite Web.
- A navegação/login completos do ADM não fazem parte do harness de navegador: ele monta o controlador real no shell existente com sessões sintéticas. Rotas e aliases são verificados também pela suíte de navegação do ADM.
- O teste financeiro compara o valor da cotação, da reserva e do registro de pagamento no serviço real com repositórios isolados. Não comprova autorização, liquidação, webhook, cancelamento ou reembolso de um provedor externo.
- Nenhuma categoria nova arbitrária está liberada para uso: novos IDs ficam desativados até implementação e homologação de seu adapter e requisitos de operação.

## Resultado registrado — 20/10/2026
Código verificado: `2b845898351aa4ca88a941098a724fcf7e5640b2`.
Execução: [GitHub Actions 39480460591](https://github.com/iansilva23/ramo-nessa/actions/runs/39480460591).

| Verificação | Resultado |
| --- | --- |
| Core: tipagem, build e suíte | 774 passaram, 0 falharam, 51 ignorados por guardas de ambiente |
| ADM: sintaxe e suíte | 163 passaram, 0 falharam |
| PostgreSQL 16: duas integrações isoladas | 2 passaram, 0 falharam, 0 ignorados |
| Web Passageiro | Análise, 184 testes, 2 testes em Chrome e build aprovados |
| Web Motorista | Análise, 108 testes e build aprovados |
| Chromium e WebKit | Fluxos descritos acima aprovados nos dois navegadores |
| Revisão visual | Capturas examinadas em 1200, 860 e 390 px; screenshots adicionais em 1440 px |
| Integridade | Providers financeiros, ledger, migrations, projetos nativos e ride_bottom_sheet preservados contra a base #35 |

Os 51 testes ignorados na suíte geral não são aprovação: permanecem dependentes de seus ambientes próprios. O job PostgreSQL executa especificamente a integração transacional nova e a regressão V5 financeira existente, não todos os testes PostgreSQL do repositório.
Os artefatos da execução incluem as capturas `regions-pricing-browser-evidence` e os dois bundles Web, sujeitos à retenção do GitHub Actions.

## Diagnóstico do ambiente antes da ativação
`deploy/staging/inspect-regions-pricing.mjs` é um inventário somente de leitura:
- Consulta nomes, imagens, saúde e o label de revisão dos containers Ramo Nessa em execução; não lê nem imprime Config.Env.
- Diferencia o checkout Git da revisão implantada. Ausência de label de revisão é registrada como desconhecida, sem inferir main.
- No PostgreSQL, usa exclusivamente transações READ ONLY com limites de execução e espera por lock. Retorna catálogo efetivo, hash de snapshot, migrações e contagens de dependências; não retorna dados pessoais, credenciais ou o snapshot completo.
- Se houver vários containers PostgreSQL, não escolhe um automaticamente. A opção --postgres-container exige um PostgreSQL Ramo Nessa já em execução.
- Não gera backup, não aplica plano, não altera arquivos/configuração, não cria imagens e não reinicia serviços. O inventário não substitui o backup nem a revisão das dependências.

Nesta sessão não houve acesso SSH direto. A tentativa de consultar health/ready pela navegação disponível também não permitiu verificar o host. Os relatórios executados pelo operador posteriormente permitiram conferir o runtime; isso não fornece acesso SSH direto ao agente.

Execução no terminal já existente da VPS, sem checkout/merge:
```bash
bash <<'AUDITAR_REGIOES'
set -euo pipefail
git -C /opt/ramo-nessa fetch origin feature/admin-regions-pricing-simple-20261020
git -C /opt/ramo-nessa show 6472c875b974d0c6cae6b8785374e1cfafecb996:deploy/staging/inspect-regions-pricing.mjs |
  sudo node --input-type=module -
AUDITAR_REGIOES
```
O fetch somente atualiza referências Git; o programa faz leitura do runtime e do banco. A execução deste diagnóstico não autoriza publicação ou preparação do catálogo.

## Ampliação da homologação — 20/10/2026
Código verificado: `6472c875b974d0c6cae6b8785374e1cfafecb996`.
- [Regressão completa com PostgreSQL](https://github.com/iansilva23/ramo-nessa/actions/runs/39482627575): 827 testes do Core, 825 aprovados, nenhuma falha e dois ignorados por guardas específicas. O banco foi criado e removido somente no runner GitHub; migrations foram executadas duas vezes para verificar idempotência.
- No mesmo job, três testes do diagnóstico de leitura passaram: projeção sem variáveis de ambiente, SQL READ ONLY, seleção não ambígua de banco e rejeição de ações de escrita.
- A confirmação MFA foi testada contra PostgreSQL com dois pools independentes: rejeição do código usado no login, consumo único em concorrência, limite persistente de tentativas e revogação de sessão.
- Um processo real do Core foi iniciado em localhost com schema PostgreSQL exclusivo. O teste passou pelo login HTTP real, permissões de leitura, desafio 428, senha inválida, confirmação MFA, idempotência, dois administradores concorrentes, política pública, sessão real de passageiro, horário autoritativo, simulação e arquivamento/auditoria.
- No modo de teste, ausência de identidade de desenvolvimento retorna AUTH_NOT_CONFIGURED/503; sessão explícita inválida retorna 401. O teste verifica os dois comportamentos sem liberar cotação anônima.
- A automação WebKit passou a esperar a visibilidade do alfinete renderizado antes de medir sua posição; continua exigindo arraste efetivo e alteração real das coordenadas.
- [Revisão Web correspondente](https://github.com/iansilva23/ramo-nessa/actions/runs/39482627456): Core, ADM, PostgreSQL isolado, Chromium/WebKit e apps Web.

Os dois testes ainda ignorados na suíte PostgreSQL completa tratam de entrega de OTP persistida e de uma migração/preferência com sessão, sob guardas próprias. Não são declarados aprovados. O resultado anterior de 51 ignorados era da suíte sem banco; esta execução ampliada valida as integrações então não exercitadas, exceto esses dois casos.

Continuam pendentes provedores externos, aparelhos reais e aceite do proprietário. O diagnóstico real da VPS/banco foi recebido posteriormente do operador. Nenhum teste conectou-se a Google, Asaas, Mercado Pago, VPS ou banco reais.

## Preparação para o ambiente instalado — 20/10/2026
O primeiro inventário do operador confirmou que checkout, imagens e catálogo podem ter revisões diferentes. Um label ausente não prova a origem da imagem; por isso o comando de leitura ganhou a opção `--runtime-files`.

Essa opção calcula assinaturas do JavaScript compilado do Core, por área, do lockfile e dos cinco arquivos centrais do ADM; informa somente os mounts de Web/Caddy e os checksums das migrations. Não lê Config.Env, não exibe configurações privadas e não altera containers ou banco.

[Quatro referências compiladas](https://github.com/iansilva23/ramo-nessa/actions/runs/39500465201) permitem comparar o runtime com a integração financeira, a referência indicada pela tag V5, a base #35 e a candidata de Regiões e preços. O grupo de pagamentos tem a mesma assinatura nas quatro referências:
`b2ae90d9dc642bc696f8cd9f9838bf53ee72ec912532789a655102112316630d`.
O segundo relatório do operador confirmou a assinatura integral compilada do Core na referência financeira e os cinco hashes do ADM na base V5. A área de pagamentos corresponde também à candidata. As origens instaladas de Core e ADM são diferentes; essa evidência não explica, sozinha, todos os problemas funcionais.

[Pacotes Web configurados, sem deploy](https://github.com/iansilva23/ramo-nessa/actions/runs/39500699215), na revisão `fa5ad133c06721b5d9e48468a5e61a7fbd384c95`: Passageiro e Motorista compilados com base-href dos caminhos existentes, Core na mesma origem e configuração pública Firebase/Maps já existente. Artefato `ramo-v5-configured-web-homologation`, ID `12299797049`, digest `sha256:ea823ef57c06ce1026565e0dbde74a0a72bb1125988761793900eea7b67445cb`, retenção do GitHub Actions até 03/11/2026. Diferem dos bundles example.invalid da suíte de revisão. Sua compilação não comprova mapas, sessão ou pagamentos no ambiente conectado.

O plano privado do reset agora inventaria as tabelas reais de ledger, carteira e tentativas/eventos Asaas, além das chaves estrangeiras que as relacionam. Um teste PostgreSQL executa o CLI em schema descartável e verifica permissões 0600, catálogo/dados preservados e recusa de sobrescrever o plano.
[Regressão ampliada](https://github.com/iansilva23/ramo-nessa/actions/runs/39500996970): 826 testes do Core aprovados, nenhuma falha, dois ignorados; mais cinco testes de inspeção/assinaturas aprovados.

Para completar a conferência, no terminal da VPS:
```bash
bash <<'CONFERIR_ARQUIVOS'
set -euo pipefail
git -C /opt/ramo-nessa fetch origin feature/admin-regions-pricing-simple-20261020
git -C /opt/ramo-nessa show efa6527a78b5f50d0d54790e430059b2925792aa:deploy/staging/inspect-regions-pricing.mjs |
  sudo node --input-type=module - --runtime-files
CONFERIR_ARQUIVOS
```
A conferência é somente leitura. Backup verificado, preparação do catálogo e ativação são etapas posteriores. Não executar os scripts antigos de Asaas/GeoAgent para esta atualização: eles têm contratos e imagens de outras etapas.

[Revisão Web final desta etapa](https://github.com/iansilva23/ramo-nessa/actions/runs/39501498518), código `41229ad0a9ea5c7e7770eec1324685c33769d051`: seis jobs aprovados, incluindo Chromium/WebKit com três reaberturas consecutivas do editor, arraste e teclado. A automação aguarda a pintura do mapa antes de medir o alfinete. O diff desde o build configurado contém somente um teste do ADM e o CLI/teste do plano; nenhum código dos aplicativos mudou após a compilação configurada.

## Backup específico desta atualização
`deploy/staging/backup-regions-pricing.mjs` aceita somente as duas imagens exatas previamente auditadas. Não usa o checkout antigo para resolver Compose ou configurações. Exige serviços atuais saudáveis, documentos e mounts Web/Caddy esperados, além de espaço para cópia e restauração.

- Preserva o dump lógico do banco, todos os mounts de Core/Gateway (incluindo documentos, Web e Caddy), imagens dos cinco serviços e arquivos Compose identificados pelo runtime.
- O inventário Docker completo, incluindo o ambiente efetivo, é guardado somente em pasta root 0700/arquivos 0600 na VPS. **O backup contém segredos e dados pessoais: não anexar seus arquivos ao PR nem colar seu conteúdo no chat.**
- Restaura o dump em PostgreSQL descartável com `--network none`, sem expor portas, executar Core ou usar credenciais dos provedores. Confere migrations e lê todas as tabelas públicas restauradas. Arquivos tar são listados e têm SHA-256 registrado; documentos não são declarados restaurados apenas por isso.
- Reconfere runtime/configurações/migrations antes de emitir `BACKUP_VERIFICADO`. Falhas mantêm pasta `.incomplete`; só recursos descartáveis criados pela execução são removidos. Nenhum serviço ativo é reiniciado e nenhum reset/migration é aplicado.
- A verificação não é uma cópia do disco inteiro nem sincronização transacional dos uploads com o dump. Atividade concorrente legítima pode ocorrer; os valores restaurados são registrados privadamente, sem exigir igualdade com contagens vivas posteriores.
- Não restaura banco ativo automaticamente. O retorno de código/configuração e a restauração de catálogo como nova versão são etapas distintas; restaurar um banco antigo pode perder transações posteriores.

A suíte `Regions and Pricing - Backup Review` testa guardas e executa backup/restauração reais em Docker com dados exclusivamente sintéticos no runner. O resultado real da VPS ainda deve ser recebido antes de declarar o backup concluído.

## Backup real recebido e preparação da candidata
O operador retornou `BACKUP_VERIFICADO`, com restauração PostgreSQL isolada concluída, arquivos montados listados, nenhum serviço reiniciado e nenhum reset aplicado. O diretório privado e o SHA-256 do manifesto foram fornecidos na conversa operacional; não são publicados neste documento.

`deploy/staging/prepare-regions-pricing.mjs REVISAO DIRETORIO_BACKUP SHA256_MANIFESTO` reaproveita esse backup:
- Confere o hash externo do manifesto e o tamanho/hash/permissões de cada arquivo, além da identidade e configuração dos cinco serviços.
- Extrai somente Core/ADM para um diretório novo. O checkout existente não é modificado. Exige igualdade exata das migrations e seus checksums; não executa migrations.
- Compila imagens separadas, compara lockfile e código compilado de pagamentos com o Core ativo e valida o Caddy vigente usando armazenamento temporário e nenhuma rede.
- Restaura o backup em PostgreSQL descartável sem rede. Usa somente o CLI de catálogo, sem iniciar API, workers ou provedores. Ensaios: exportação do plano, reset com proprietário humano configurado, três regiões/zero tarifas/categorias preservadas, repetição idempotente e recuperação integral do snapshot anterior como nova versão.
- Confere todas as demais tabelas públicas antes/depois dos ensaios. Somente catálogos/auditoria podem mudar na cópia. Não aplica reset ao banco ativo e não altera serviços ativos.
- Mantém logs, plano de ensaio e ambiente somente em arquivos privados. O plano gerado nessa cópia é exclusivamente de ensaio e **não deve ser usado para aplicar reset no banco ativo**: a aplicação real exigirá plano próprio com referência atual do catálogo ativo.
- Reconfere runtime, migrations, Caddy e Compose após o ensaio, remove exclusivamente o banco/volume descartáveis e registra `CANDIDATA_PREPARADA_E_TESTADA`.

A preparação ainda não é ativação nem homologação funcional conectada. Os bundles Web configurados tiveram os 108 arquivos verificados localmente contra o manifesto e o digest do artefato; não foram publicados.

[Candidate Preparation Review aprovado](https://github.com/iansilva23/ramo-nessa/actions/runs/39505009335), código `e24a5ecb93e22b8054b599c4f377809fc63dcffb`: seis testes de guardas e execução real da preparação em Docker, com builds, backup/restauração, paridade de migrations/pagamentos, validação Caddy e reset/idempotência/recuperação na cópia PostgreSQL. O fixture é sintético; o resultado do ensaio com o backup da VPS ainda precisa ser recebido do operador.
