# Organização do ADM inteiro

Pedido: usar Localidades e Tarifas como referência visual para simplificar o ADM inteiro, mantendo as funcionalidades. A tentativa de modo claro no Guia foi cancelada; nenhum arquivo dos apps Passageiro ou Motorista foi alterado nesta implementação.

## Revisão e decisões

O ADM possui 26 templates HTML, incluindo páginas antigas redirecionadas para Regiões e preços. Revisados os campos estáticos e os editores dinâmicos de Guia Local, Site, Marketing, GeoAgent, busca de motoristas e preços. O menu mantém todas as rotas e passa a separá-las por assunto. Grupos vazios são ocultados conforme as permissões existentes, sem liberar acessos.

A apresentação segue a referência: fundo claro, cartões brancos sem sombras pesadas, bordas suaves, amarelo nas ações, tipografia e espaçamento consistentes. A seção aprovada Regiões e preços, seu controlador e stylesheet original ficam intocados.

Telas com vários blocos ganham atalhos “Nesta página”; no celular, um seletor compacto leva diretamente ao assunto. Nenhum conteúdo é escondido por esses atalhos. Campos relacionados são agrupados em identificação, benefício/valores, validade, participação, mensagem, veículo, mapa ou cálculo. Permissões da equipe ficam separadas por área. A validação abre detalhes fechados para mostrar o campo que precisa ser preenchido.

## Inventário dos templates

| Template | Campos estáticos |
| --- | ---: |
| agency.html | 26 |
| audit.html | 4 |
| benefits.html | 22 |
| costs.html | 23 |
| coupons.html | 21 |
| design.html | 2 |
| drivers.html | 37 |
| finance.html | 15 |
| fleet.html | 0 |
| geo.html | 6 |
| guide.html | 1 |
| integrations.html | 7 |
| issues.html | 4 |
| localities.html | 55 |
| marketing.html | 39 |
| notifications.html | 11 |
| overview.html | 0 |
| passengers.html | 4 |
| pricing-publications.html | 1 |
| pricing.html | 64 |
| privacy.html | 10 |
| regions-pricing.html | 5 |
| rides.html | 6 |
| site.html | 0 |
| staff.html | 52 |
| support.html | 4 |

Total: 419 campos estáticos. Os campos gerados pelos controladores permanecem com seus modelos e validações atuais. Nenhum foi excluído.

## Preservação e validação

A mudança se limita à apresentação do ADM e a textos de cabeçalho e orientação. Uma camada separada organiza os elementos originais sem copiar ou recriar seus controles. IDs, nomes, opções, valores, seleção, estados disabled/hidden, vínculos com formulários, restrições HTML e handlers continuam preservados. Os controladores de negócio, API, backend, integrações, tabelas financeiras, apps Passageiro/Motorista e configurações de produção não são modificados.

O navegador verifica os 26 templates em 1440, 390 e 320 pixels, incluindo integridade dos controles e permissões; validação em formulário recolhido; valores mantidos ao usar os atalhos; associação dos checkboxes ao formulário. Os fluxos autenticados existentes de Guia e Regiões/preços são repetidos para verificar criação, edição, rascunhos, publicação, mapas, login/MFA e logout.

A revisão fica em PR DRAFT, sem merge na main. Nenhuma mudança é ativada na VPS por este workflow.

## Validação concluída

Revisão de código `c4adb9fd2c6a2b0bfc50de831a7a05ad55acf0da`, [run 40038106764](https://github.com/iansilva23/ramo-nessa/actions/runs/40038106764), concluído com sucesso:

- 170 testes ADM aprovados, incluindo inclusão de todos os stylesheets na imagem distribuível.
- Os 26 templates conferidos em Chromium e WebKit, em 1440, 390 e 320 pixels. Controles, valores, validações, associação aos formulários e permissões preservados.
- Fluxos autenticados do Guia Local aprovados nos dois navegadores: cenários A–G, foto, contatos, mapa, rascunho/publicação, prévia, duplicação, reordenação, arquivo/restauração e login/MFA/logout.
- Fluxos de Regiões e preços aprovados nos dois navegadores: cadastro, edição, arquivo/restauração, simulação, mapa, coordenadas, teclado e acesso somente de leitura.
- Capturas finais revisadas; grupos do menu e lista/formulário organizados. O seletor nativo de localidade do GeoAgent recebeu contenção para impedir largura extra no Safari, sem alterar as opções ou a rolagem da tabela.

As verificações utilizam conteúdo sintético e API autenticada de teste. Não acessam dados nem serviços da VPS. A ativação online e a aceitação pelo responsável no seu dispositivo permanecem como próxima etapa.
