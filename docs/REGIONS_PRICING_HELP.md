# Ajuda e tutoriais de Regiões e preços

O botão **Ajuda e tutoriais** fica na área existente de Regiões e preços. Não cria outro menu de gestão. Há 18 capítulos com busca sem distinção de acentos/maiúsculas, instruções de cadastro, definição dos campos, limites, consequências nos aplicativos, dependências, segurança e solução de erros.

Os botões **?** dos campos e opções abrem o capítulo correspondente. Cabeçalhos dos editores, simulação, exclusão, mapa, horários e histórico também dão acesso à ajuda. A ajuda abre em diálogo acima do formulário atual: Escape ou Voltar ao painel fecha somente o manual e devolve o foco. A navegação deve manter os valores ainda não salvos.

## Conteúdo e limites documentados
- Região, município/UF, busca, centro, raio, teclado, sobreposições e validação das duas pontas.
- Quatro passos do assistente, categorias permitidas e tarifa opcional salva com a região.
- Categorias existentes, capacidade, requisito 4x4 e novos tipos que permanecem desativados sem suporte operacional.
- Direção/ida e volta, períodos, preço fixo, km por rota do servidor, mínimo, passageiros e adicionais.
- Adicionais são valores fixos por período; nomear uma cobrança não cria gatilho de bagagem/espera/evento.
- Simulação usa centros e não comprova oferta de motorista, pagamento ou todos os pontos das coberturas.
- Salvamento direto, confirmação no servidor, MFA novo, conflito de revisão e resposta de conexão incerta.
- Exclusão por arquivamento, dependências desativadas, restauração desativada e preservação de histórico.
- Lista de histórico limitada às versões retornadas; sem prometer botão de recuperação integral inexistente.
- Web primeiro; aceite conectado, provedores e aparelhos reais continuam sendo verificações distintas.

Os exemplos não preenchem preços e não criam tarifas. A leitura não chama APIs, não acessa credenciais, não persiste buscas e não altera permissões. Nenhum código do Core, pagamentos, migração de banco ou aplicativo móvel é alterado por esta entrega.

## Manutenção
Conteúdo em `apps/admin/src/help/regions-pricing-guide.js`. Cada capítulo declara arquivos de referência para revisão técnica; essas referências não são expostas ao administrador. Alterar a semântica de um campo exige revisar o capítulo e o vínculo em `helpTopicForLabel` / `helpTopicForCheck`.

Os testes verificam busca no conteúdo completo, ligações válidas, cobertura dos campos e opções do editor. O ensaio Chromium/WebKit está integrado ao fluxo existente de gestão: navegação, busca, ausência de chamadas de API, entrada como leitor, foco/Escape, preservação de formulário e confirmação MFA, além de capturas em 1440/860/390 px.

A instalação desta alteração na homologação foi confirmada posteriormente pelo operador com ADM_AJUDA_E_COORDENADAS_ATUALIZADOS, revisão 7efa18dc87da800d313357902316107029735666. Não houve novo reset. O registro operacional completo está em docs/REGIONS_ADMIN_UPDATE.md; aceite funcional conectado continua separado.

## Resultado verificado — 20/10/2026
Código: `d104d1f925e60aad1d0b7525a7c64152077cc61e`.
[Revisão Web 39514657691](https://github.com/iansilva23/ramo-nessa/actions/runs/39514657691): seis jobs aprovados (ADM, Core, PostgreSQL, Chromium/WebKit, Passageiro Web e Motorista Web).

- ADM: sintaxe e **166 testes aprovados**, sem falhas ou ignorados, tanto localmente quanto no runner.
- Chromium e WebKit: busca no conteúdo, busca sem acentos, retorno sem resultados, limpeza, links relacionados, foco/teclado/Escape, leitura sem chamada de API, acesso como leitor e ausência de overflow.
- Ajuda sobre assistente e confirmação de senha/MFA: valores e estados dos campos preservados, foco devolvido ao botão de origem, nomes dos campos continuam clicáveis para focar a entrada.
- Fluxo existente de gestão: cadastro de região, tarifa, edição protegida, simulação, ausência de período noturno, arquivamento/restauração, arraste e teclado no mapa continuam aprovados nos dois motores.
- Capturas da ajuda examinadas em 1440, 860 e 390 px, além da entrada no painel em tablet/celular. Evidência no artefato `regions-pricing-browser-evidence` da execução, sujeito à retenção do GitHub Actions.
- Tipagem/testes/build do Core, integrações PostgreSQL existentes e análise/testes/build dos dois aplicativos Web aprovados. A guarda de preservação financeira/nativa passou.

O ensaio utiliza autenticação/serviços reais da aplicação com repositórios em memória e provedores sintéticos no navegador. Não representa aceite no login conectado da VPS, em aparelhos reais ou em provedores externos. Naquele ensaio, a instalação ainda estava pendente; posteriormente o operador confirmou a atualização somente do ADM, registrada em docs/REGIONS_ADMIN_UPDATE.md.

## Complemento: coordenadas no assistente de região
Latitude e Longitude ficam imediatamente abaixo de Pesquisar no mapa, tanto em Adicionar quanto em Editar região. Campos de texto com teclado decimal reaproveitam `parseLocalityCoordinates`, já usado pelo editor anterior: sinal, zero, ponto/vírgula decimal e precisão numérica preservados; latitude limitada ao mapa Web Mercator e longitude a ±180.

Posicionar no mapa e Enter nesses campos validam o par inteiro antes de alterar o centro. Continuar também valida/aplica um par que ainda esteja em digitação. Inválidos não movem o mapa nem autorizam avanço; um raio inválido não é corrigido silenciosamente ao aplicar coordenadas. O raio numérico preserva a digitação pendente dos campos. Pesquisa ou seleção no mapa substituem o par pelo novo ponto selecionado.

O ensaio de navegador cobre entrada inválida, zero, vírgula, precisão, raio, Enter, Continuar sem aplicação anterior, sincronização da pesquisa/arraste, persistência real pelo endpoint de gestão e reabertura da região. Inclui capturas do assistente em 1440/860/390 px. A ajuda dos dois campos leva ao capítulo do mapa, ampliado com instruções completas.

Não altera o contrato de região no servidor ou os dados já cadastrados. Esta inclusão foi instalada junto da ajuda, conforme retorno do operador. Não houve reset nem atualização dos aplicativos Passageiro/Motorista.

### Verificação do complemento — 20/10/2026
Código `07968353dd19b8f14c9e07cf1cd2224543a06bcc`; [revisão 39516160222](https://github.com/iansilva23/ramo-nessa/actions/runs/39516160222).
O ADM tem 167 testes aprovados, sem falhas ou ignorados. Chromium e WebKit aprovaram os novos cenários de coordenadas junto com o fluxo existente de regiões/tarifas, segurança e ajuda. Capturas do assistente examinadas em 1440/860/390 px: campos abaixo da busca, em duas colunas no computador/tablet e empilhados no celular.

Também foram aprovados Core, PostgreSQL e análise/testes/build Web de Passageiro e Motorista; os seis jobs da revisão passaram. Nenhuma implantação na VPS foi executada por essa revisão. Aceite conectado e em aparelhos reais continua separado.
