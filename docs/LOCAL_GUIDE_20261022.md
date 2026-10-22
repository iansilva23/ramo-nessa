# Guia Local — entrega técnica para homologação

PR DRAFT: https://github.com/iansilva23/ramo-nessa/pull/39

Branch: `feature/local-guide-20261022`. Base: `feature/admin-web-entry-toggle-20261021`, commit `ccd7db77152180a01c649a3da5b04da9ef392e20` (PR #37). Sem merge ou deploy.

## Resultado

O passageiro recebe um Guia Local dinâmico com localidades, categorias, seis modelos e ações opcionais. O ADM usa uma entrada única e a hierarquia **localidade → categoria → conteúdos**, com editor compacto, publicação separada de rascunhos e persistência no Core/PostgreSQL.

A implementação está disponível para revisão técnica e visual. A aprovação final ainda depende da homologação em aparelhos físicos, GPS/provedores reais e comparação visual pelo responsável.

## Auditoria e preservação

Antes das mudanças foram inspecionados branch, HEAD, alterações pendentes, arquitetura Flutter/Core/ADM, cadastros de passeios e dependências. O checkout anterior com trabalhos pendentes foi preservado; o Guia foi implementado em checkout isolado.

A referência administrativa real foi `regions-pricing.html`, `regions-pricing-admin.js` e os estilos `rp-*`: hierarquia, cartões, diálogos, espaçamentos e edição agrupada foram reutilizados sem copiar a lógica de tarifas. Os sete JPEGs aprovados orientaram os modelos; nomes comerciais, horários e eventos ilustrativos não foram publicados.

O diff de regressão, executado localmente e no CI, confirma ausência de alterações em pagamentos, finanças, preços, carteira, app do motorista, projetos nativos Android/iOS, seção administrativa Regiões e preços e `ride_bottom_sheet.dart`. A barra “Passeios e experiências em Jericoacoara” mantém seu componente visual; somente o callback passa a abrir o Guia.

## Aplicativo

- Entrada inferior **Guia Local**, mantendo as demais entradas. Título e subtítulo solicitados, seletor de localidades na mesma tela e retorno preservando seleção.
- Categorias fotográficas dinâmicas em duas colunas, quatro em telas largas, com fundo preto/grafite, amarelo, imagens, degradês e cantos arredondados.
- Filtros opcionais, listas progressivas, detalhes, falhas de rede e estados vazios. Catálogo publicado em cache por três minutos, requisições simultâneas compartilhadas e retorno ao conteúdo anterior em falha de atualização. Imagens reutilizadas pelo cache do Flutter.
- Ações opcionais em layout que acomoda vários botões: Instagram, WhatsApp com mensagem, site HTTPS, página interna e rota. Delivery pode usar somente WhatsApp e Instagram.

| Modelo | Estrutura disponível |
| --- | --- |
| Passeios | Capa, filtros, foto, duração, percurso/referência, resumo, roteiro, inclusões e ações |
| Regras e orientações | Capa, ícone, resumo, detalhes, fonte/link oficial e atualização |
| Guia com destaques | Capa, destaque principal, mini cards e outras experiências |
| Eventos e programação | Capa, foto, data, horários, local, resumo e ações |
| Gastronomia | Capa, estabelecimento, referência, culinária, descrição e ações opcionais |
| Casas de show | Capa, estabelecimentos, localização, programação e ações |

### Calcular rota

As coordenadas são classificadas pelo serviço existente `CoordinatePlaceResolver`. O Guia preserva a prova e os identificadores de área do `RamoPlace`, entrega o destino ao mapa principal e reutiliza localização autorizada, roteamento e seleção/cotação de veículos existentes. O passageiro continua decidindo se solicita a corrida e confirma pagamento.

Não há chamada automática de solicitação ou cobrança, preço inventado nem Google Maps como fluxo principal. Destino sem coordenadas ou fora da cobertura recebe tratamento de indisponibilidade.

## ADM

O módulo mantém a rota existente `/administrodo/passeios`, agora chamada Guia Local. Reutiliza o router, sessão/escopos, cliente de API, padrões de formulário/diálogo e `createPricingGeofenceMap` para selecionar destinos. A configuração anterior de Divulgação e Instagram permanece acessível.

Localidades ficam no topo, categorias na coluna lateral e itens no espaço principal. Há pesquisa, Publicados/Rascunhos/Ocultos, prévia, duplicação, reordenação por botões utilizáveis por toque, arquivamento/restauração e histórico recuperável como rascunho.

O cadastro ocorre em um editor: foto, nome, descrição e ações. Somente campos da ação escolhida são exibidos; opções específicas do modelo ficam recolhidas. O endereço é preservado ao adicionar/remover rota e não aparece em duplicidade. Upload JPEG/PNG/WebP até 8 MB, prévia e enquadramento vertical. Salvar/publicar fica bloqueado durante envio da foto. Recursos do mapa são liberados ao fechar o painel.

**Salvar rascunho** preserva a versão pública. **Publicar** valida e copia a edição para a versão pública. **Despublicar** oculta sem excluir. Reordenar altera a ordem pública sem publicar o texto em revisão. Trocas de modelo preservam os dados e orientam conferir a prévia.

## Backend e dados

Migration **087 aditiva**, criando `local_guide_catalog`, `local_guide_images` e `local_guide_history`. O catálogo guarda hierarquia, ordem, filtros, modelo, destaque, fotos, ações, coordenadas e cópias draft/published. Revisão global, transação e bloqueio de linha evitam sobrescrita concorrente. Histórico privado retorna até 30 versões; imagens são imutáveis pelo SHA-256.

Permissões existentes `communications:read` e `communications:write`, validação de dados/links/destinos e tratamento de conflito. Catálogo público omite campos administrativos. Fotos referenciadas somente por rascunhos exigem autenticação. A projeção pública no PostgreSQL é reaproveitada enquanto a revisão não muda.

APIs: `/v1/content/guide`, `/v1/content/guide/images/:id`, `/v1/admin/guide`, `/v1/admin/guide/history`, `/v1/admin/guide/images` e `/v1/admin/guide/places`.

A migration cria Jericoacoara, Preá e Jijoca e seis categorias iniciais em Jericoacoara. Só Passeios começa publicada; as outras ficam em rascunho. Passeios/fotos existentes são copiados sem alterar ou excluir os originais. APIs antigas continuam disponíveis e lendo o cadastro original: **não há sincronização reversa automática**. Clientes antigos precisam ser atualizados para consumir o novo Guia.

## Testes executados e evidências

Código validado: **`9f294f81fe6dad56ffd46edf0482ab947347c36a`**.

Execução final, três jobs concluídos com sucesso: https://github.com/iansilva23/ramo-nessa/actions/runs/39788450563

| Verificação | Resultado executado |
| --- | --- |
| Core | Typecheck e build passaram; 868 testes, **866 passaram, zero falhas, dois ignorados** |
| Migration PostgreSQL 16 | Aplicação e reaplicação pelo runner; teste de preservação de passeios/fotos, persistência, publicação isolada, concorrência entre dois editores e histórico passou |
| Regressão de tarifas existente | Teste HTTP/PostgreSQL/Chromium passou sem alterar sua lógica |
| ADM | Verificação sintática e **169 testes passaram**, incluindo HTML real do Guia no loader de produção e rejeição de raiz incompatível |
| ADM em navegadores | **Chromium e WebKit**: cenários A–G, prévia, duplicação, reordenação sem publicar rascunhos, arquivamento, restauração, busca e layout móvel/desktop |
| Sessão e navegação ADM | Login/MFA, router real, Guia e logout pelo shell real passaram em ambos os navegadores |
| Editor ADM | Publicação aguarda upload; endereço da rota aparece uma vez e é preservado |
| Flutter | **224 testes passaram**, incluindo fluxo de destino no mapa, abertura da seleção/cotação e ausência de solicitação/cobrança automática |
| Análise Flutter | Sem erros/avisos; dez informações preexistentes fora dos novos arquivos |
| Formatação Dart | Seis arquivos verificados, zero alterações pelo formatador |
| Revisão visual Flutter | **Nove verificações passaram**: início em 320/390/900 px e os seis modelos |
| Web | Build release concluído, base `/passageiro/` |
| Preservação de escopo | Diff de arquivos protegidos passou |

Os dois testes condicionais ignorados são preexistentes: persistência de tentativas Asaas e preferência de push Web. Não são declarados aprovados. A execução local anterior passou 809 testes Core com 59 condicionais ignorados; a evidência principal é a rodada final com PostgreSQL acima.

Os testes administrativos usam o controller, cliente de API, autenticação e handlers reais com repositórios em memória e dados sintéticos. O teste separado PostgreSQL comprova persistência real. Não houve inserção das fixtures em produção.

### Facilidade de uso — cenários medidos

Cada cenário usou **um editor**, sem assistente de várias etapas. A localização não aparece no delivery; data/horário e fonte oficial ficam nas opções do modelo. A versão pública foi consultada para confirmar que a edição em rascunho permanecia privada.

| Cenário | Conteúdo | Cliques de ponteiro observados, Chromium / WebKit |
| --- | --- | --- |
| A | Restaurante com foto, descrição e Instagram | 2 / 2 |
| B | Delivery com WhatsApp e Instagram, sem rota | 2 / 2 |
| C | Casa de show com Instagram e rota; preservação do endereço | 6 / 6 |
| D | Festa com data, horário e referência | 4 / 4 |
| E | Regra com fonte/link e atualização | 4 / 4 |
| F | Categoria de destaques no Preá | 4 / 3 |
| G | Edição publicada salva como rascunho, público preservado | 3 / 3 |

Esses números são da instrumentação de cliques automatizados nos fluxos delimitados pelos testes. **Não representam o total de interações humanas**: preencher campos, escolher opções por API do Playwright, upload e navegação anterior ao trecho medido não entram nessa contagem. A avaliação humana da facilidade de uso permanece na homologação.

### Capturas e artefatos

- Capturas atuais do ADM e JSON dos cenários: `docs/local-guide-evidence/`.
- Widgets Flutter: `apps/passenger/guide-test-artifacts/`. Os nove PNGs já versionados são byte a byte idênticos aos gerados pelo CI final.
- Artefato ADM: https://github.com/iansilva23/ramo-nessa/actions/runs/39788450563/artifacts/12430466100
- Artefato passageiro: https://github.com/iansilva23/ramo-nessa/actions/runs/39788450563/artifacts/12429722985

As capturas usam conteúdo sintético e fotografia existente do projeto; não comprovam disponibilidade de estabelecimentos/eventos. O CI limpa imagens anteriores antes da execução para não publicar evidência antiga em caso de interrupção.

## Como utilizar o ADM após implantação e homologação

1. Abra **Guia Local**. Clique em **+ Localidade**, informe o nome e salve/publice.
2. Selecione a localidade e clique no **+** de categorias. Informe nome/foto e escolha **Modelo da página** entre as seis prévias prontas.
3. Entre na categoria e clique em **+ Adicionar**. Preencha foto, nome e descrição. Use **Opções adicionais** para culinária, evento, duração, fonte ou filtros conforme necessário.
4. Em **Adicionar botão**, escolha a ação e preencha somente os campos exibidos. Repita para vários botões; defina principal, ordem, ativação ou remoção individual. Para delivery, escolha apenas WhatsApp e Instagram.
5. Use **Pré-visualizar**. **Salvar rascunho** mantém a versão pública; **Publicar** aplica a alteração. As opções de gerenciamento permitem despublicar, duplicar, mover, arquivar e recuperar versão como rascunho.

## Commits e revisão

- `c28431ec`: implementação do Guia, modelos, ADM, persistência e evidências iniciais.
- `73f43363`: estado de endereço/foto, ciclo de vida do mapa, cenários de navegador, formatação e preparação do CI.
- `9f294f81`: preparação dos runners e garantia de evidências atuais; código validado na execução final.
- O commit posterior deste relatório e das capturas altera somente `docs/`.

O envio foi feito pela conexão autenticada do GitHub porque o Git local não possui credencial de push. As árvores local/remota foram comparadas e eram idênticas em cada envio. O checkout anterior e seus trabalhos pendentes continuam preservados.

A instalação dos navegadores no runner encontrou timeouts no espelho Ubuntu do Azure; o workflow usa o espelho Ubuntu oficial por HTTPS apenas no ambiente descartável. Nenhuma configuração do servidor do Ramo Nessa foi alterada.

## Pendências e limites

Homologar em aparelhos físicos Android/iOS, permissões/GPS, integração com provedores reais em ambiente de homologação e fidelidade final às referências. Não foram gerados/distribuídos APK/IPA. As prévias do ADM representam o modelo e não executam os botões externos ou corridas.

A instalação da migration e das versões de Core/ADM/app ainda não ocorreu no ambiente operacional. **Sem merge, deploy, migração destrutiva, corrida, pagamento ou conteúdo comercial ilustrativo publicado.** O PR permanece DRAFT.

## Arquivos alterados em relação à base

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
- `docs/local-guide-evidence/chromium-delivery-editor-mobile.png`
- `docs/local-guide-evidence/chromium-desktop.png`
- `docs/local-guide-evidence/chromium-full-shell.png`
- `docs/local-guide-evidence/chromium-mobile.png`
- `docs/local-guide-evidence/chromium-scenarios.json`
- `docs/local-guide-evidence/webkit-delivery-editor-mobile.png`
- `docs/local-guide-evidence/webkit-desktop.png`
- `docs/local-guide-evidence/webkit-full-shell.png`
- `docs/local-guide-evidence/webkit-mobile.png`
- `docs/local-guide-evidence/webkit-scenarios.json`
