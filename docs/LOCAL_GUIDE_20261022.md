# Guia Local — auditoria e implementação

## Base auditada antes das alterações

- Branch isolada: `feature/local-guide-20261022`; base `ccd7db77152180a01c649a3da5b04da9ef392e20`, PR #37. A base inclui a pesquisa Google e a remoção da tela Web de deslizar. O PR financeiro #38 contém ferramentas operacionais independentes; não são incorporadas ao Guia.
- Checkout anterior contém alterações pendentes e foi preservado. Nenhum arquivo dele foi editado.
- Passageiro Android/iOS/Web: Flutter compartilhado, `PassengerMainShell`, `PassengerHomeScreen`, `AgencyToursScreen`, `HttpAgencyTourService`.
- Backend: Core Node/TypeScript, PostgreSQL, autenticação administrativa por escopos, APIs `/v1/content/tours`, `agency_tours` (migration 052), imagens binárias versionadas.
- ADM: JavaScript modular, router existente, componentes de formulário, dialogs e estilos. Referência real aprovada: `regions-pricing.html`, `regions-pricing-admin.js`, classes `rp-*` em `styles.css`. Reaproveitar hierarquia, cards, navegação curta e editor em painel; não alterar tarifas.
- Mapa: `CorePlaceSearchService.classifyCoordinate` emite classificação/prova existente; `PassengerHomeScreen` já calcula rota e abre cotação. Integração do Guia fornece somente o destino para esse fluxo.
- Sete JPEGs anexados inspecionados. Dois modelos de Gastronomia complementares: ações opcionais permitem delivery sem rota e estabelecimentos com rota. Referências são design, não fonte de conteúdo público.

## Decisões

Modelo aditivo isolado para conteúdo: localidades → categorias → itens. Cada registro possui cópia de trabalho e publicação independente. Alterações usam revisão otimista e transação com histórico. Nenhuma migration anterior é modificada. Passeios e fotos existentes são copiados sem excluir ou atualizar os originais. APIs antigas continuam disponíveis para clientes anteriores.

A ação de rota reutiliza classificação, origem/GPS, roteamento e cotação existentes, sem criar corrida ou cobrança. Fotos novas são imutáveis; imagens de rascunho exigem autenticação. A publicação valida destinos e hierarquia; ocultar uma categoria/localidade oculta seus descendentes sem apagá-los.

Não há merge, deploy, reset, transação financeira, alteração de credencial ou conteúdo ilustrativo publicado por esta entrega.

## Entrega para revisão

### Aplicativo

- Entrada inferior Guia Local; localidades e categorias carregadas do Core. A seleção muda os conteúdos na mesma tela e permanece ao voltar das categorias.
- Seis modelos reutilizáveis: passeios, regras, destaques, eventos, gastronomia e casas de show. Capas, filtros opcionais, fotografias, detalhes e múltiplas ações.
- Tema preto/grafite e amarelo, cards responsivos, carregamento progressivo, cache de conteúdo publicado de três minutos e reutilização das imagens pelo Flutter.
- Ações de Instagram, WhatsApp com mensagem, site HTTPS, página interna e destino no mapa. Delivery pode ter apenas WhatsApp e Instagram.
- Calcular rota classifica as coordenadas pelo serviço existente, entrega um RamoPlace ao mapa principal, usa a origem autorizada e abre o fluxo existente de rota/categorias/cotação. Nunca solicita uma corrida, confirma pagamento ou inventa preço.
- O arquivo do painel/barra aprovada do mapa não foi alterado. Somente o callback de navegação passa a abrir o Guia.

### ADM

Entrada única, mantendo a URL legada `/administrodo/passeios`. Organização: localidade → categoria → itens. Reutiliza classes `rp-*` da seção Regiões e preços, componentes de diálogo do painel e `createPricingGeofenceMap` para destinos. A seção de tarifas permanece intacta.

Editor único com foto, nome, descrição e ações; detalhes do modelo ficam recolhidos. Cada ação exibe seus próprios campos. Há busca, prévia, duplicação, reordenação com botões utilizáveis por toque, arquivamento/restauração e recuperação do histórico como rascunho. Upload JPEG/PNG/WebP até 8 MB, prévia e enquadramento vertical. Mantida a configuração existente de Divulgação e Instagram.

Salvar rascunho preserva a versão pública. Publicar valida e copia o rascunho. Despublicar oculta sem excluir. Reordenar altera a ordem pública sem publicar o texto em revisão. Mudanças de modelo preservam campos e avisam sobre a mudança da apresentação.

### Dados e permissões

Migration 087 aditiva: `local_guide_catalog`, `local_guide_images`, `local_guide_history`. Catálogo com revisão global, cópias draft/published, transação e controle de concorrência. Fotos imutáveis pelo SHA-256. Histórico privado limitado a 30 versões na leitura. Catálogo público omite campos administrativos; fotos de rascunhos exigem sessão administrativa. Escopos existentes `communications:read` e `communications:write`.

APIs novas: `/v1/content/guide`, `/v1/content/guide/images/:id`, `/v1/admin/guide`, `/v1/admin/guide/history`, `/v1/admin/guide/images` e busca administrativa de destinos. URLs externas são validadas, páginas internas precisam apontar para categorias publicadas e ações de rota precisam de coordenadas válidas.

A migration cria as três localidades iniciais e seis categorias em Jericoacoara. Só Passeios começa publicada. Copia os passeios e fotos já existentes, sem alterar os originais. Os demais modelos começam em rascunho; nomes comerciais e eventos das referências não são publicados. As APIs antigas continuam lendo os cadastros originais: não existe sincronização reversa automática. Clientes antigos precisam de atualização para consumir o novo Guia.

### Validação e evidências

- Retomada: verificação sintática do ADM e **169 testes passaram**, incluindo o HTML real do Guia no loader de produção e rejeição de uma raiz incompatível.
- Core nesta retomada: typecheck e build passaram; 868 testes, 809 passaram, zero falhas e 59 ignorados por condições de ambiente.
- Execução anterior registrada: 224 testes Flutter, build Web e análise sem erros/avisos; dez informações preexistentes fora dos novos arquivos. Como houve ajustes posteriores, a revisão final repete estes checks no CI.
- Capturas anteriores reais de widgets Flutter: início em 320, 390 e 900 px e seis modelos; fixtures sintéticas, fotografia existente do projeto. Arquivos em `apps/passenger/guide-test-artifacts/`.
- Cenários administrativos A–G executados anteriormente em Chromium e WebKit, com controller e handlers reais e persistência em memória autenticada. Incluem restaurante, delivery sem rota, casa de show, evento, regra com fonte, categoria no Preá e edição sem alterar a versão pública. JSON e capturas em `apps/admin/guide-browser-artifacts/`.
- A contagem dos JSON mede cliques de ponteiro gerados pelo Playwright; preenchimento, seleção e upload não são contados. Não representa o total de interações humanas.
- Cenário adicional de login/MFA, router e logout do shell real incluído na automação para CI; ainda precisa execução na revisão final.
- Teste PostgreSQL nativo cobre preservação do legado, publicação durável, disputa entre dois escritores e histórico. Requer banco descartável. Não foi executado localmente nesta retomada; CI usa PostgreSQL 16.
- Validação SQL anterior com PGlite (PostgreSQL em WASM, uma sessão) não substitui o teste de concorrência em PostgreSQL nativo.
- Auditoria por diff preserva pagamentos, finanças, tarifas, carteira, app do motorista, projetos nativos Android/iOS, barra do mapa e seção administrativa de preços.

O workflow `Local Guide Review` executa Core com PostgreSQL descartável, ADM em Chromium/WebKit, Flutter completo e build Web. Não contém deploy. Resultados de CI e eventuais correções serão registrados no PR DRAFT.

### Como usar

1. Abra **Guia Local** no ADM. Para criar uma localidade, clique em **+ Localidade**, informe o nome e salve/publice.
2. Selecione a localidade e clique no **+** de categorias. Informe nome, foto e escolha **Modelo da página** entre as seis prévias prontas.
3. Entre na categoria e clique em **+ Adicionar**. Informe foto, nome e descrição. Detalhes de evento, culinária, duração ou fonte ficam em **Opções adicionais** conforme o modelo.
4. Em **Adicionar botão**, selecione uma ação. Preencha somente os campos exibidos: link, número/mensagem ou destino no mapa. Repita para várias ações; escolha principal, ordem ou desative/remova cada botão.
5. Use **Pré-visualizar** para conferir. **Salvar rascunho** mantém a versão pública atual. **Publicar** aplica a alteração. As opções adicionais do item permitem despublicar, duplicar, mover, arquivar e recuperar versões.

### Limites para homologação

Ainda exigem validação: CI da revisão final, teste em aparelhos físicos Android/iOS, GPS/permissões e provedores reais em ambiente de homologação, além de comparação final com as referências aprovadas. Não foram gerados APK/IPA nesta entrega. Capturas usam conteúdo sintético e não comprovam disponibilidade de estabelecimentos ou eventos.

Nenhum merge ou deploy foi realizado. O usuário autorizou nesta retomada o envio da branch ao repositório público e a abertura do PR DRAFT. Publicação operacional permanece uma etapa posterior.

## Revisão remota

- PR DRAFT: https://github.com/iansilva23/ramo-nessa/pull/39
- Branch remota: `feature/local-guide-20261022`, base `feature/admin-web-entry-toggle-20261021` (`ccd7db77`).
- Commit remoto inicial: `c28431ec5d72ef46a6b18a0acb359d67e22d5040`. Árvore `859cbb9c` idêntica aos commits locais `60bec9a0` + `f244a52a`; envio realizado pela API autenticada porque o Git local não possui credencial de push.
- Primeira execução CI: migration aplicada e reaplicação ignorada corretamente; teste PostgreSQL do Guia passou (legado, persistência, isolamento, concorrência e histórico). Core: 865 passaram, uma falha de preparação do job (Playwright ausente para teste legado de localidades), dois ignorados. Workflow corrigido para instalar a dependência sem alterar o teste ou a lógica de tarifas.
- Ajustes adicionais no editor evitam repetir o endereço quando a ação de rota é adicionada, encerram os recursos do mapa ao fechar o painel e bloqueiam salvar/publicar enquanto a foto está em envio. Testes de navegador incluem estes cenários.

- Passageiro no CI inicial: **224 testes passaram**, **9 capturas de widgets passaram**, análise sem erros/avisos (dez infos preexistentes), build Web release concluído. Artefato: https://github.com/iansilva23/ramo-nessa/actions/runs/39786405206/artifacts/12429142033. Formatação produzida pelo SDK do CI incorporada ao código.

### Arquivos alterados em relação à base

- `.github/workflows/local-guide-review.yml`
- `apps/admin/guide-browser-artifacts/chromium-delivery-editor-mobile.png`
- `apps/admin/guide-browser-artifacts/chromium-desktop.png`
- `apps/admin/guide-browser-artifacts/chromium-mobile.png`
- `apps/admin/guide-browser-artifacts/chromium-scenarios.json`
- `apps/admin/guide-browser-artifacts/webkit-delivery-editor-mobile.png`
- `apps/admin/guide-browser-artifacts/webkit-desktop.png`
- `apps/admin/guide-browser-artifacts/webkit-mobile.png`
- `apps/admin/guide-browser-artifacts/webkit-scenarios.json`
- `apps/admin/guide.css`
- `apps/admin/index.html`
- `apps/admin/package.json`
- `apps/admin/pages/guide.html`
- `apps/admin/src/api.js`
- `apps/admin/src/app.js`
- `apps/admin/src/guide-admin.js`
- `apps/admin/src/guide-model.js`
- `apps/admin/test/admin_public_path.test.js`
- `apps/admin/test/browser/local-guide-flow.mjs`
- `apps/passenger/guide-test-artifacts/events.png`
- `apps/passenger/guide-test-artifacts/gastronomy.png`
- `apps/passenger/guide-test-artifacts/highlights.png`
- `apps/passenger/guide-test-artifacts/home-320.png`
- `apps/passenger/guide-test-artifacts/home-390.png`
- `apps/passenger/guide-test-artifacts/home-900.png`
- `apps/passenger/guide-test-artifacts/rules.png`
- `apps/passenger/guide-test-artifacts/tours.png`
- `apps/passenger/guide-test-artifacts/venues.png`
- `apps/passenger/lib/src/app.dart`
- `apps/passenger/lib/src/features/guide/data/local_guide_service.dart`
- `apps/passenger/lib/src/features/guide/presentation/local_guide_screen.dart`
- `apps/passenger/lib/src/features/home/presentation/passenger_home_screen.dart`
- `apps/passenger/lib/src/features/home/presentation/passenger_main_shell.dart`
- `apps/passenger/test/local_guide_map_test.dart`
- `apps/passenger/test/local_guide_test.dart`
- `apps/passenger/test/local_guide_visual_review.dart`
- `backend/core/migrations/087_local_guide.sql`
- `backend/core/src/db/repositories.ts`
- `backend/core/src/guide/guide-routes.ts`
- `backend/core/src/guide/guide-store.ts`
- `backend/core/src/guide/guide.ts`
- `backend/core/src/server.ts`
- `backend/core/test/local_guide.test.ts`
- `backend/core/test/local_guide_http.test.ts`
- `backend/core/test/local_guide_postgres.test.ts`
- `docs/LOCAL_GUIDE_20261022.md`

### Preparação dos runners

O espelho `azure.archive.ubuntu.com` apresentou timeouts durante o download das dependências dos navegadores no runner descartável. O workflow troca esse endereço pelo arquivo oficial Ubuntu via HTTPS apenas nesse runner. Também limpa capturas anteriores do checkout de CI para que uploads de execuções interrompidas não sejam confundidos com evidência nova. Nenhuma configuração do servidor do Ramo Nessa é alterada.
