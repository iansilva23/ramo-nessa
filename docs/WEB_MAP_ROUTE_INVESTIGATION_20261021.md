# Mapa branco após selecionar uma rota — investigação Web

## Sintoma recebido

O proprietário relata que o mapa fica branco após escolher uma rota e volta a
desenhar depois de tocar ou movimentar a tela. Prioridade: Passageiro e Motorista
Web. Android/iOS continuam sem publicação ou alterações em projetos nativos.

## Evidência e limite do diagnóstico

Auditoria contra `7ff58f71f7501117f4dc10c10095ea5ee7dc0c04`, na branch existente
e no PR DRAFT #36. Foram conferidos os dois mapas, seus controladores, o fluxo
de seleção de rota do Passageiro, os fluxos de oferta/corrida do Motorista,
configuração do mapa, HTML Web, bloqueio inicial e versões travadas dos plugins.

Há uma corrida de câmera verificável no código: após `newLatLngBounds`, ambos
os controladores consultavam o zoom e podiam enviar outro comando para limitá-lo.
Na implementação travada `google_maps_flutter_web 0.6.4`, a conclusão do Future
de `moveCamera` não espera a animação de `map.fitBounds`; a leitura seguinte
pode devolver o zoom anterior. Trocar apenas `animateCamera` por `moveCamera`
não eliminava essa condição.

Outra diferença verificada: o plugin Web não aplica `GoogleMap.padding` como
o SDK nativo. O painel inferior do Passageiro podia cobrir parte da rota.

Referência do código do plugin: https://github.com/flutter/packages/blob/google_maps_flutter_web-v0.6.4/packages/google_maps_flutter/google_maps_flutter_web/lib/src/convert.dart

A tela pública instalada foi aberta em um navegador real. O acesso à escolha
da rota exige autenticação. Não foi criada conta, alterada segurança ou usada
uma sessão fictícia contra o servidor real. **A tela branca relatada ainda não
foi reproduzida no ambiente conectado do proprietário.** As condições acima são
defeitos confirmados, mas não provam que explicam todas as causas do sintoma.

## Correção candidata

Commit `4d307ea05ec293105434640778f9dbde4bca8e9a`:

- Somente no Web, calcular centro e zoom finais pela projeção Mercator,
  usando as dimensões reais do widget e suas margens antes de chamar o SDK.
- Enviar um alvo completo por enquadramento, sem `fitBounds`, consulta de
  zoom antigo ou segundo comando de correção de zoom.
- No Passageiro, reservar também a área do cartão inferior e controles superiores.
- Aplicar a mesma proteção aos mapas de rota do Passageiro e do Motorista.
- Recusar câmera para viewport vazio ou coordenadas inválidas; tratar pontos
  iguais, trechos horizontais/verticais e passagem pelo antimeridiano.
- Manter as chamadas e animações nativas existentes fora do ramo `kIsWeb`.

Não há simulação de toque, deslocamento artificial para forçar redesenho,
recarga repetida, recriação do mapa, mudança de chaves ou atualização de plugins.
O motor de preços, catálogo, tarifas, pagamentos e banco não foram alterados.

## Verificação

Execução: https://github.com/iansilva23/ramo-nessa/actions/runs/39533600874

Resultado: **6 jobs aprovados**, incluindo análise e testes dos dois apps, os
dois testes de câmera no Chrome por app, os quatro testes de projeção, os
builds Web release, Core, PostgreSQL e regressão do ADM em Chromium/WebKit.
A análise ainda registra avisos informativos preexistentes em arquivos fora
desta correção; não houve erro ou warning novo nos arquivos alterados.

Os testes novos usam os controladores reais com uma interface de mapa gravadora.
Ela devolve deliberadamente zoom antigo: no Web o enquadramento deve emitir
um único `newLatLngZoom`, sem consultar esse zoom e sem qualquer gesto. O mesmo
teste no host nativo verifica a preservação do caminho de bounds/animação.

Os testes de projeção verificam geometricamente que os pontos da rota ficam
na área livre em 320×568, 390×844, 844×390, 860×1100 e 1440×900, além de rotas
degeneradas, antimeridiano, viewport inválido e coordenadas inválidas.

Esses testes não carregam tiles Google, não reproduzem o compositor GPU de
Safari e não substituem a homologação no aparelho que apresentou a tela branca.
Os bundles da revisão usam `example.invalid`, servindo apenas para verificar
a compilação; não são pacotes configurados para instalar no servidor.

## Homologação ainda necessária

Sem publicar nada, o proprietário deve identificar navegador/aparelho e o
aplicativo/tela exata em que ocorreu o sintoma. Após uma instalação Web
especificamente autorizada, validar com Google Maps real:

1. Selecionar origem e destino; aguardar sem tocar no mapa.
2. Confirmar mapa e linha da rota visíveis; repetir com outro destino.
3. Repetir em rota curta/longa, retrato/paisagem, navegador e PWA instalado.
4. No Motorista, conferir oferta, trajeto ao passageiro e início da viagem.
5. Voltar da busca de endereço e alternar a aba/aplicativo; verificar novo desenho.
6. Se persistir, registrar vídeo, console e requisições de tiles na mesma sessão,
   sem compartilhar tokens ou dados pessoais, antes de atribuir a falha a outra causa.

Nenhuma implantação, reset, merge, alteração financeira ou atualização nativa
foi executada nesta investigação. A candidata permanece em PR DRAFT.
