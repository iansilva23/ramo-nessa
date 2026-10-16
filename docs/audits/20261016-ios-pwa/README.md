# Continuação: deslocamento de toque reproduzido na PWA iOS

Data: 16/10/2026. Esta investigação continua a [auditoria anterior](https://github.com/iansilva23/ramo-nessa/blob/3710db7cbcf62224d8e66e609e7af0b803984c79/docs/IOS_PWA_TOUCH_AUDIT_20261016.md), sem repetir sua matriz de WebKit Linux.

## Resultado novo

**A PWA foi instalada pela interface nativa do Safari, aberta pelo ícone da Tela de Início e o primeiro toque no centro pintado do avatar não abriu o perfil.** Há uma diferença de **59 pontos CSS** entre a coordenada visual esperada do controle e a coordenada que o helper do Flutter calcula nesse estado.

O ensaio usou um mapa substituto passivo, sem interromper propagação dos eventos. Portanto, a perda desse toque não depende do controle experimental de consumo de eventos da auditoria anterior. A ausência de PointerInterceptor continua sendo um defeito de integração separado; não deve ser tratada como explicação suficiente para este deslocamento.

Nenhum app, servidor, banco ou arquivo da VPS foi alterado. Todas as mudanças desta continuação são de instrumentação de auditoria e documentação.

## Ambiente e percurso comprovado

- Pacote passageiro compilado: `5aa49f6099dc418a65236af90859bc6db2a17c04`, o pacote cuja publicação foi confirmada pelo operador.
- macOS/Xcode 26.5, simulador iPhone 15 Pro Max/iOS 26.5, aparência clara.
- Fixture HTTPS local: autenticação sintética, negação controlada de GPS e substituto passivo do Google Maps; nenhuma credencial de produção.
- [Workflow 38951924594](https://github.com/iansilva23/ramo-nessa/actions/runs/38951924594), código de auditoria `28568f34d3219bfc2403d032cb9219a627ed582b`.
- Artifact `12068619434`, SHA-256 do ZIP `e869168a6ffc1e9790e871a302ac108b360cd627a3e7c29e5d8d6cdeef25446f`.
- Sequência nativa registrada: fechar dica de primeiro uso → More → Share → Add to Home Screen → Add → Home → terminar Safari → tocar ícone “Ramo Audit”.
- Host em primeiro plano: `com.apple.webapp`.
- A própria página registrou `navigator.standalone === true` e `display-mode: standalone === true`. Este ensaio não é uma simulação de standalone no WebKit Linux.

O workflow terminou verde porque o percurso, a identificação do host e o toque medido foram executados sem falha do XCTest. **Não há asserção de abertura do perfil no teste; o verde não significa que o aplicativo funcionou.** O resultado de interação foi conferido nas capturas e na geometria.

## Evidências de primeira abertura

[Captura antes](before.png) · [Captura depois](after.png) · [Geometria/eventos completos](geometry.jsonl)

| Medida | Valor no modo instalado |
| --- | --- |
| Tela nativa / captura | 430 × 932 pontos; PNG 1290 × 2796 |
| Centro pintado do avatar, obtido da imagem | aproximadamente (44; 102,83) na tela |
| Viewport inicial da página | 430 × 873 |
| Após inicialização do Flutter | scrollY = 59; visualViewport.offsetTop = 59 |
| flutter-view.getBoundingClientRect() | x=0; y=-59; width=430; height=873 |
| Primeiro pointerdown | clientX=44; clientY=44; pageY=103; offsetY=103 |
| Semântica Flutter durante o toque | desativada |
| Escala visual / zoom | 1 |
| Conteúdo da tela depois do toque | idêntico ao anterior; perfil não abriu |

A leitura de startup mostrou a transição de scrollY/offsetTop de 0 para 59 durante a inicialização da PWA. O estado permaneceu até o toque. Em contraste, o registro do Safari da mesma execução manteve scrollY e offsetTop em 0.

O registro tem dois contextos consecutivos, Safari e PWA. Filtrar `standalone: true` ao analisar os eventos.

### Relação com o código do Flutter

No [event_position_helper.dart do Flutter 3.47.5](https://github.com/flutter/flutter/blob/3.47.5/engine/src/flutter/lib/web_ui/lib/src/engine/pointer_binding/event_position_helper.dart), um evento originado em outro elemento DOM é convertido por:

```
event.clientY - flutterView.getBoundingClientRect().y
```

O alvo registrado é um DIV, diferente do flutter-view. Aplicando os valores medidos:

```
44 - (-59) = 103
```

O controle desenhado corresponde a aproximadamente y=44 no conteúdo Flutter abaixo da área nativa superior. O helper calcula y=103 nesse estado: diferença de 59 pontos, compatível com o sintoma de a região clicável parecer deslocada em relação ao botão visível.

Também existem as fontes [pointer_binding.dart](https://github.com/flutter/flutter/blob/3.47.5/engine/src/flutter/lib/web_ui/lib/src/engine/pointer_binding.dart), que encaminha esse resultado ao framework, e a [correção upstream de safe area](https://github.com/flutter/flutter/commit/0748e48b3a113497b83f428047d21d29ad4ed994), identificada na auditoria anterior. A correção upstream não foi aplicada nem testada nesta continuação.

## O que esta reprodução comprova e o que falta

Comprova a instalação nativa, o estado standalone real dentro do simulador, a perda do primeiro toque no avatar, a alteração de scroll/viewport e a diferença de coordenadas no caminho do engine. As capturas de conteúdo antes/depois foram comparadas pixel a pixel, excluindo a faixa do relógio, sem diferenças.

A origem exata do scroll inicial de 59 (comportamento do WebKit, bootstrap do engine, restauração/foco ou interação entre eles) ainda precisa de um controle causal. **Não foi validada uma correção.** A igualdade com a área superior do iPhone é uma associação medida, não justificativa para inserir uma constante 59 no aplicativo.

Este teste é do passageiro, em um simulador, com serviços locais e GPS negado. Não valida aparelho físico, Google Maps real, permissões reais, notificações, teclado em uso normal, retorno do segundo plano, orientação, tema escuro ou aplicativo motorista. A instrumentação e as consultas nativas de acessibilidade podem alterar timing/layout; os registros confirmam que a semântica Flutter permaneceu desativada.

O aviso de localização bloqueada presente nas duas capturas é consequência esperada da fixture que nega GPS; não deve ser reportado como novo defeito de permissão.

## Próximo trabalho recomendado — somente web

1. Criar um controle isolado de inicialização/posição da página para o modo instalado e verificar que a geometria DOM e o desenho ficam coerentes antes de aceitar o primeiro toque.
2. Testar a causa com medições antes/depois; avaliar viewport, safe area, scroll/restauração e bootstrap. Não deslocar todos os cliques por uma constante, não bloquear zoom e não ativar semântica artificialmente para esconder o problema.
3. Proteger os controles sobre o mapa contra consumo de eventos HTML, como item separado da correção de viewport.
4. Reutilizar este percurso instalado para validar que o primeiro toque abre o perfil e comparar capturas/eventos. Depois validar no iPhone físico e no motorista.

Não executar automaticamente ações dos botões do aplicativo ao abrir. O ajuste deve corrigir a relação entre desenho e toque e preservar as funções existentes.

## Correções do instrumento que permitiram chegar à reprodução

- A escala antiga vinha do host de testes de 320 pontos; agora vem do aplicativo auditado de 430. Conferência da captura antiga: y=112,25 incorreto contra centro pintado y=150,83.
- O Safari exibia a dica “View Bookmarks, Share Menu, and Open Tabs” sobre More. O teste agora fecha esse aviso observado.
- Add to Home Screen aparece como Cell/actionGroupCell, e não Button.
- A automação aguarda o estado do controle nativo e confirma a abertura do menu com no máximo três tentativas. Esses cliques são na UI nativa de instalação do simulador, não em funções de corridas/pagamentos do app.
- Capturas e árvores do xcresult passaram a ser exportadas como arquivos inspecionáveis.

Tentativas anteriores desta continuação: workflows 38946128738 (dica bloqueava o menu), 38948511625 (Share abriu; seleção errada da linha de instalação), 38950022265 (transição do menu ainda indisponível). Todos esses bloqueios ocorreram antes da instalação e não são evidência de defeito do aplicativo. O ensaio final 38951924594 ultrapassou essas etapas.
