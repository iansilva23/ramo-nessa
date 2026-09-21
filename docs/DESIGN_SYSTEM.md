# Design System — Ramo Nessa

## Direção

O Ramo Nessa deve parecer um produto de mobilidade premium, não um template genérico de táxi.

Palavras-chave:

- limpo
- fluido
- moderno
- premium
- tecnológico
- leve
- responsivo
- vivo sem ser exagerado

## Identidade oficial

A identidade escolhida para o produto é **amarelo/dourado + preto**.

Tokens principais:

- Brand Yellow: `#FAD50E`
- Brand Yellow Light: `#FFF21A`
- Brand Gold: `#F6BF09`
- Brand Black: `#0D0D0D`
- Ink: `#111315`
- Off-white/canvas: `#F5F5F1`

O amarelo é cor de assinatura, seleção, ação e estados de marca. Ele não deve preencher todas as telas. A interface continua usando bastante espaço neutro para manter legibilidade e aparência premium.

A antiga cor verde provisória não faz mais parte do Design System.

## Arquivos de marca

Os arquivos-fonte ficam separados por finalidade:

- `apps/passenger/assets/brand/common` — logos e símbolo compartilhados
- `apps/passenger/assets/brand/passenger` — ícone e splash do Passageiro
- `apps/driver/assets/brand` — identidade específica do Motorista

O ícone do Passageiro e o ícone com a inscrição **MOTORISTA** são tratados como produtos distintos da mesma marca.

## Princípios visuais

- mapa como protagonista
- hierarquia tipográfica forte
- poucos elementos simultâneos
- bottom sheets bem desenhados
- cantos e elevações consistentes
- uso controlado de cor
- ícones simples
- estados claros e legíveis
- dark mode projetado, não apenas invertido

## Movimento

Toda animação deve comunicar uma mudança de estado.

Exemplos:

- pressionar botão: micro-scale suave
- seleção de categoria: transição de tamanho/borda
- abertura de sheet: spring controlado
- preço atualizado: fade/slide curto
- motorista encontrado: entrada do card + feedback tátil
- veículo no mapa: movimento interpolado e rotação seguindo direção
- procura de motorista: animação própria, sem spinner genérico
- corrida concluída: transição suave para resumo/pagamento

Ferramentas candidatas:

- Flutter Animate — microinterações
- Rive — momentos interativos de maior destaque
- Lottie — loaders/estados pontuais quando fizer sentido

## Home Passageiro

Prioridade visual:

1. mapa
2. destino (“Pra onde vamos?”)
3. Carro / Moto / Entrega
4. preço/ETA
5. ação principal

Evitar:

- muitos cards coloridos
- sombras pesadas
- gradientes gratuitos
- dezenas de botões na mesma tela
- aparência de painel administrativo no app do passageiro

## Motorista

A tela inicial deve destacar:

- status Offline / Online
- mapa
- ganho do período
- solicitação de corrida

Ao chegar uma corrida, a oferta deve ser extremamente legível:

- passageiro
- avaliação
- distância até coleta
- destino
- distância da viagem
- valor previsto
- contagem regressiva
- aceitar como ação principal
- recusar como ação secundária

## Fonte visual de referência

O projeto Wasalny (MIT) é uma referência forte de fluxo e composição, mas o Ramo Nessa não será um clone visual. Componentes serão reimplementados dentro da identidade própria do produto.
