# ADM — revisão do padrão visual e organização

Data: 25/10/2026. Solicitação do responsável: revisar o ADM inteiro, corrigir botões e apresentação inconsistentes, melhorar organização e transições, preservando o que funciona.

## Base e preservação

A revisão partiu de `a9cd8f1a084ebb4fd5c458a19dc2946330518d46`, branch operacional da atualização de corridas já instalada. Foram consultados os PRs abertos mais recentes, incluindo a organização do ADM (#49/#50), gestão financeira (#59), embarque (#61), suporte vinculado à corrida (#67), GPS Cinema (#71) e corridas integradas (#72/#73). Nenhum arquivo antigo foi copiado sobre a versão atual.

Referência: componentes e hierarquia de Regiões e preços. O HTML, controlador e estilos próprios dessa área permanecem intactos. Backend, cliente de API, tarifas, comissão, pagamentos, permissões do servidor, aplicativos e configurações dos provedores também não mudam. Os controles preservam os valores persistidos; abrir uma tela não salva nem ativa recursos.

Fonte final do ADM: `d3e8c5e7c471221b3477aff40b69a46a9b50e5df`.

## Achados e correções

| Achado | Resultado |
| --- | --- |
| Botões novos sem classe e com aparência nativa, sem hierarquia | Componentes compartilhados: ação principal amarela, secundária com borda, ação destrutiva identificada; tamanhos, alinhamento, foco e estados coerentes |
| Ícones de menu misturavam símbolos de fontes | Conjunto de ícones vetoriais com traço e dimensões consistentes, preservando links e visibilidade por permissão |
| Formulários de embarque e ocorrências sem agrupamento | Ativação, categorias, regras e botão de salvar em grupos separados, com rótulos explícitos e informações sobre vigência |
| Ocorrências expunham estados técnicos e versões em parágrafos soltos | Estados principais em português, versões em dois blocos, evidências recolhidas, decisão identificada e filtros locais de acompanhamento/resolução |
| Montagem das configurações financeiras de ocorrências ocorria somente no tratamento de erro | Montagem na inicialização normal da rota Financeiro, independentemente do resultado da consulta de saldo |
| Campos dinâmicos não tinham um nome acessível preciso | Rótulos associados explicitamente por `aria-labelledby`, inclusive selects |
| Mesclagem de estilos apagava bordas de ações secundárias | Corrigida a especificidade e incluída verificação do contorno no navegador |
| Atalhos podiam deixar o título sob a barra fixa | Margem de rolagem que considera a barra superior |
| Diferenças entre áreas e excesso de ruído | Padronização de superfícies, espaçamentos, cabeçalhos, tabelas, campos, mensagens e estados vazios; campos de funcionário equilibrados |
| Ausência de transições coerentes | Entrada de página de 220 ms, diálogos de 180 ms e feedback de interação curto; preferência por movimento reduzido respeitada |

O dashboard financeiro mantém sua superfície escura e seus cálculos. Foram preservados dados e ações. Nenhuma decisão financeira é executada pelo novo filtro ou pela apresentação visual.

## Arquivos de aplicação

- `apps/admin/admin-workspace.css`: padrão compartilhado e adaptação a telas menores.
- `apps/admin/src/admin-components.js`: componentes pequenos de apresentação, sem chamadas de API.
- `apps/admin/src/admin-workspace.js`: ícones da navegação; links e agrupamentos preservados.
- `apps/admin/src/app.js`: deslocamento de uma chamada da área de erro para a inicialização normal do Financeiro.
- `apps/admin/src/boarding-admin.js`: agrupamento, rótulos, mensagens e preservação de edição após falha.
- `apps/admin/src/manual-refunds-admin.js`: ajuste visual dos controles existentes.
- `apps/admin/src/ride-occurrences-admin.js`: apresentação, filtros e formulários organizados; endpoints e payloads preservados.

## Validação

- 177 testes ADM aprovados e verificações de sintaxe.
- Chromium e WebKit: 26 páginas, 585 controles originais preservados, larguras de 1440, 390 e 320 px sem transbordamento horizontal.
- Componentes dinâmicos em ambos os navegadores: abertura sem escrita, independência dos controles, revisão e valores, preservação de edição após falha, proteção de somente leitura, falha ao carregar, atendimento existente, filtros, confirmação de decisão e movimento reduzido.
- Regressão autenticada do Guia, login/MFA/logout e fluxo de Regiões e preços em ambos os navegadores.
- Capturas do Financeiro, suporte, motoristas, funcionários e demais áreas geradas pelo navegador e revisadas. Os dados dessas capturas são sintéticos.

Execução final da interface: https://github.com/iansilva23/ramo-nessa/actions/runs/40243647831

Ensaios anteriores encontraram e permitiram corrigir a associação dos selects e a especificidade das bordas. A aprovação é da revisão final indicada acima.

## Instalação exclusiva do ADM

Instalador: `deploy/staging/update-admin-design.mjs`. Revisão operacional imutável para execução: `a627bc5b6c482464864857c92e2e405de03d5053`.

Execução de ensaio: https://github.com/iansilva23/ramo-nessa/actions/runs/40243715743

Reutiliza o contrato de atualização ADM existente, adaptado ao inventário real da revisão de corridas integradas. Aceita somente a fonte final indicada. Confere o inventário completo antes e depois da troca. Constrói a camada sobre a imagem do Gateway realmente ativa, mantendo Caddy, ambiente, volumes, rede e inicialização.

Guarda imagem de retorno e hash na pasta privada `/opt/ramo-nessa-admin-design/updates`. Uma falha após a troca recupera a imagem anterior, sem restaurar banco. Recusa uma versão divergente ou mudança concorrente. A repetição depois do sucesso não reinicia o serviço. O teste Docker descartável verifica todos os dados públicos por fingerprint, incluindo tarifa salva, corrida histórica, pagamento e ledger, tanto em sucesso quanto em falha com retorno.

Não executa migrações ou escrita no banco. Os controles A/B/C são consultados em transação somente leitura e comparados ao final. Não liga funcionalidades e não instala Android/iOS. A troca do Gateway pode causar reconexão breve do navegador.

Para executar, o responsável precisa buscar as branches `feature/admin-design-system-20261025` e `ops/admin-design-web-20261025`, pois a revisão visual final tem seu próprio histórico. O instalador usa `git archive` sem checkout, reset, merge ou alteração da árvore de trabalho existente.

## Estado e limites

PR #74: interface. PR #75: instalador. Ambos DRAFT, sem merge.

Esta revisão visual ainda depende da execução do comando pelo responsável na VPS. Homologação em navegadores automatizados não substitui a conferência final no equipamento real. Não houve teste novo de transação bancária real nem publicação nativa; o escopo é o ADM.
