# Regras Comerciais v1 — Ramo Nessa

Status: REVISADO para implementação.
Data-base: 2026-09-29.

Este documento é a fonte comercial de verdade da v1. Os valores abaixo são servidos pelo Core/backend. O Passageiro consulta o Core para obter a cotação e não mantém preço comercial autoritativo no Flutter. O catálogo é versionado e administrável pelo ADM.

## Regras globais

- Comissão Ramo Nessa: 10% sobre a tarifa-base da corrida.
- Repasse ao motorista/prestador: 90% da tarifa-base.
- A compensação de coleta distante é repassada integralmente ao motorista e não sofre comissão.
- Pagamento no lançamento: somente Pix, cartão e Carteira Ramo Nessa.
- Pix tem ajuste padrão de 0,99% (`99 bps`), administrável pelo Financeiro do ADM.
- Cartão tem ajuste padrão de 4,98% (`498 bps`), administrável pelo Financeiro do ADM.
- Ajustes de Pix/cartão recuperam custo de processamento separadamente e não alteram a comissão de 10%/90% sobre a tarifa-base.
- Carteira mantém a tarifa-base, sem ajuste de processamento.
- Dinheiro: desativado no lançamento.
- Pix direto para o motorista: desativado.
- O serviço só entra em matching/despacho após pagamento confirmado ou valor devidamente autorizado/reservado pelo provedor.
- Gasolina de referência para compensação de coleta distante: R$ 7,00/L.
- Entrega não recebe adicional noturno após 22h. Quando não existir tarifa específica, o preço de Entrega é o mesmo de dia e de noite.
- Rotas que entram em Jericoacoara e exigem acesso 4x4 só podem casar com veículo aprovado como 4x4.

## Compensação por motorista distante

O sistema sempre procura primeiro um motorista elegível próximo.

Até 8 km entre motorista e passageiro: sem adicional.

Acima de 8 km, adicionar apenas uma compensação de combustível do deslocamento excedente:

- Moto/Entrega: referência 30 km/L -> aproximadamente R$ 0,23/km excedente.
- Carro/Comfort: referência 9 km/L -> aproximadamente R$ 0,78/km excedente.

Fórmula:

```text
km_excedente = max(0, distancia_motorista_passageiro_km - 8)
adicional = ceil(km_excedente * preco_combustivel / consumo_km_l)
```

O valor é mostrado ao passageiro antes da confirmação. O adicional integra o total cobrado do passageiro, mas é repassado integralmente ao motorista e não entra na base da comissão de 10%.

## Jericoacoara

### Táxi Buggy — dentro da Vila

A decisão comercial do Buggy ainda não foi alterada nesta revisão. Até nova decisão, o comportamento vigente do Core permanece:

- 1 passageiro: R$ 40 dia / R$ 60 após 22h;
- 2 passageiros: R$ 42 / R$ 62;
- 3 passageiros: R$ 44 / R$ 64;
- 4 passageiros: R$ 46 / R$ 66;
- máximo de 4 passageiros.

### Entrega de moto — dentro da Vila

| Distância retirada -> entrega | Preço |
| --- | ---: |
| até 0,7 km | R$ 5 |
| > 0,7 até 1,2 km | R$ 5 |
| > 1,2 até 1,6 km | R$ 5 |
| > 1,6 até 2,0 km | R$ 5 |
| acima de 2,0 km | R$ 6 |

Entrega mantém o mesmo preço depois das 22h.

### Jeri <-> Preá

| Categoria | Dia | Após 22h |
| --- | ---: | ---: |
| Moto | R$ 90 | R$ 90 |
| Entrega | R$ 90 | R$ 90 |
| Carro — somente veículo 4x4 aprovado | R$ 140 | R$ 140 |
| Comfort/Black 4x4 | R$ 150 | R$ 200 |

### Outras rotas 4x4 de Jeri

| Rota | Categoria | Dia | Após 22h |
| --- | --- | ---: | ---: |
| Jeri <-> Jijoca | Comfort/Black 4x4 | R$ 160 | R$ 200 |
| Jeri <-> Aeroporto JJD | Comfort/Black 4x4 | R$ 240 | R$ 240 |

Na rota Jeri <-> Aeroporto JJD não há adicional noturno específico.

## Jijoca

### Moto e Entrega

| Região/localidade | Moto | Entrega |
| --- | ---: | ---: |
| Dentro da sede / próximo | R$ 10 | R$ 5 |
| Vila São Paulo | R$ 15 | R$ 10 |
| Córrego da Forquilha I | R$ 15 | R$ 10 |
| Córrego do Urubu | R$ 15 | R$ 10 |
| Córrego da Forquilha II | R$ 20 | R$ 15 |
| Carro Quebrado | R$ 20 | R$ 20 |
| Baixio | R$ 20 | R$ 20 |
| Córrego Perdido | R$ 25 | R$ 25 |
| Cruzeiro do Brandão | R$ 30 | R$ 30 |
| Córrego de Dentro | R$ 30 | R$ 30 |
| Lagoa das Pedras | R$ 35 | R$ 35 |
| Córrego do Mourão | R$ 35 a R$ 40 | R$ 35 a R$ 40 |
| Chapadinha / região afastada | R$ 40 a R$ 45 | R$ 40 a R$ 45 |
| Caminho para Mangue Seco | R$ 50 | R$ 50 |
| Próximo ao Mangue Seco | R$ 55 | R$ 55 |
| Mangue Seco / limite distante | R$ 60 | R$ 60 |

Córrego do Mourão e Chapadinha continuam como faixas e, enquanto não houver valor único, não devem ser despachados como tarifa exata.

### Táxi/Carro local

| Região/localidade | Carro |
| --- | ---: |
| Dentro da sede / próximo | R$ 45 |
| Vila São Paulo | R$ 45 |
| Córrego da Forquilha I | R$ 50 |
| Córrego do Urubu | R$ 50 |
| Córrego da Forquilha II | R$ 55 |
| Carro Quebrado | R$ 55 |
| Baixio | R$ 60 |
| Córrego Perdido | R$ 65 |
| Cruzeiro do Brandão | R$ 65 |
| Córrego de Dentro | R$ 65 |
| Lagoa das Pedras | R$ 70 |
| Córrego do Mourão | R$ 75 |
| Chapadinha / região afastada | R$ 80 |
| Caminho para Mangue Seco | R$ 80 |
| Próximo ao Mangue Seco | R$ 80 |
| Mangue Seco / limite distante | R$ 90 |

Não existe adicional noturno próprio para a tabela local de Jijoca.

### Jijoca <-> Preá

| Categoria | Dia | Após 22h |
| --- | ---: | ---: |
| Moto | R$ 60 | R$ 60 |
| Entrega | R$ 60 | R$ 60 |
| Carro comum | R$ 120 | R$ 140 |
| Comfort/Black | R$ 170 | R$ 190 |

## Preá

### Localidades

| Destino | Moto | Entrega | Carro |
| --- | ---: | ---: | ---: |
| Preá | R$ 7 | R$ 7 | R$ 25 |
| Formosa | R$ 7 | R$ 7 | R$ 25 |
| Cavalo Bravo | R$ 7 | R$ 7 | R$ 25 |
| Caiçara | R$ 14 | R$ 14 | R$ 30 |
| Laguim | R$ 9 | R$ 9 | R$ 25 |
| Buraco Azul | R$ 19 | R$ 19 | R$ 35 |
| Caiçara de Baixo | R$ 27 | R$ 27 | R$ 45 |
| Córrego dos Anas | R$ 23 | R$ 23 | R$ 40 |
| Córrego das Panelas | R$ 45 | R$ 45 | R$ 60 |
| Guias Monteiros | R$ 30 | R$ 30 | R$ 45 |
| Aeroporto JJD | R$ 60 dia / R$ 80 noite | R$ 60 | R$ 180 |
| Cajueirinho | R$ 40 | R$ 40 | R$ 50 |
| Lagoa Azul | R$ 50 | R$ 50 | R$ 60 |
| Lagoa do Paraíso | R$ 90 | R$ 90 | R$ 110 |
| Jericoacoara | R$ 90 | R$ 90 | R$ 140 — somente veículo 4x4 aprovado |
| Castelhano | R$ 18 | R$ 18 | R$ 35 |
| Quilombo Córrego dos Iús | R$ 30 | R$ 30 | R$ 45 |
| Barrinha de Baixo | R$ 30 | R$ 30 | R$ 45 |
| Pinguela | R$ 30 | R$ 30 | R$ 45 |
| Lagamar | R$ 50 | R$ 50 | R$ 60 |
| Munzua | R$ 50 | R$ 50 | R$ 60 |
| Carrapateiras | R$ 35 | R$ 35 | R$ 45 |
| Aranaú | R$ 60 | R$ 60 | R$ 70 |

Carro local no Preá recebe +R$ 10 após 22h nas localidades configuradas. Entrega não recebe esse adicional.

### Beira-Mar

| Destino | Moto | Entrega | Carro |
| --- | ---: | ---: | ---: |
| Preá Beach Villas | R$ 7 | R$ 7 | R$ 20 |
| Play Kitié | R$ 7 | R$ 7 | R$ 20 |
| Cabaña | R$ 7 | R$ 7 | R$ 20 |
| Ranchos | R$ 7 | R$ 7 | R$ 20 |
| Vila Preá | R$ 7 | R$ 7 | R$ 20 |
| Clube da Irrancha | R$ 9 | R$ 7 | R$ 25 |
| Casas Eli Lula | R$ 9 | R$ 7 | R$ 27 |
| D3 Luna | R$ 9 | R$ 7 | R$ 27 |
| Kite Lodge | R$ 10 | R$ 8 | R$ 27 |
| Beach House | R$ 13 | R$ 10 | R$ 27 |
| Vida ao Vento | R$ 13 | R$ 10 | R$ 27 |
| Casa de Praia Teto Branco | R$ 15 | R$ 10 | R$ 33 |

### Comfort/Black local no Preá

Nas localidades locais e na Beira-Mar, quando Carro e Comfort/Black puderem operar a mesma rota:

```text
Comfort/Black = preço do Carro + R$ 40
```

Quando houver adicional noturno do Carro local, ele é somado antes do adicional de Comfort. Entrega continua sem adicional noturno.

### Viagens longas saindo do Preá

Os valores abaixo permanecem sem adicional noturno específico, salvo a rota Jijoca que possui tarifa própria.

| Destino | Moto | Entrega | Carro | Comfort/Black |
| --- | ---: | ---: | ---: | ---: |
| Jijoca | R$ 60 | R$ 60 | R$ 120 dia / R$ 140 noite | R$ 170 dia / R$ 190 noite |
| Cruz | R$ 80 | R$ 80 | R$ 120 | R$ 170 |
| Bela Cruz | R$ 150 | R$ 150 | R$ 180 | R$ 230 |
| Acaraú | R$ 100 | R$ 100 | R$ 190 | R$ 240 |
| Marco | R$ 160 | R$ 160 | R$ 250 | R$ 300 |
| Triângulo do Marco | R$ 170 | R$ 170 | R$ 260 | R$ 310 |
| Granja | R$ 170 | R$ 170 | R$ 260 | R$ 310 |
| Itarema | R$ 170 | R$ 170 | R$ 260 | R$ 310 |
| Morrinhos | R$ 190 | R$ 190 | R$ 320 | R$ 370 |
| Camocim | R$ 200 | R$ 200 | R$ 350 | R$ 400 |
| Amontada | R$ 250 | R$ 250 | R$ 360 | R$ 410 |
| Santana do Acaraú | R$ 250 | R$ 250 | R$ 400 | R$ 450 |
| Parazinha | R$ 140 | R$ 140 | R$ 480 | R$ 530 |
| Itapipoca | R$ 300 | R$ 300 | R$ 500 | R$ 550 |
| Sobral | R$ 350 | R$ 350 | R$ 520 | R$ 570 |

Os valores de Comfort dessas viagens longas ficam explícitos no catálogo para preservar os valores revisados, equivalentes hoje a +R$ 50 sobre o Carro.

### Aeroporto JJD

| Rota | Categoria | Dia | Após 22h |
| --- | --- | ---: | ---: |
| Preá <-> Aeroporto JJD | Moto | R$ 60 | R$ 80 |
| Preá <-> Aeroporto JJD | Entrega | R$ 60 | R$ 60 |
| Preá <-> Aeroporto JJD | Carro | R$ 180 | R$ 180 |
| Preá <-> Aeroporto JJD | Comfort/Black | R$ 230 | R$ 230 |
| Jeri <-> Aeroporto JJD | Comfort/Black 4x4 | R$ 240 | R$ 240 |

## Elegibilidade e acesso

Preço nunca substitui autorização operacional.

O backend deve impedir oferta de categoria/veículo incompatível com a rota. Na revisão atual:

- Carro não-4x4 continua proibido em rota que exige acesso 4x4 a Jericoacoara;
- a tarifa de Carro Preá <-> Jeri de R$ 140 só pode casar com veículo cadastrado/aprovado como 4x4;
- Comfort/Black atravessando o limite de Jeri exige veículo 4x4 aprovado;
- Jeri <-> Jijoca e Jeri <-> Aeroporto permanecem sem tarifa de Carro comum.

## Configuração no backend/Admin

Todas as regras devem ser configuráveis e versionadas:

- preço por origem/destino/localidade;
- categoria;
- janela de horário;
- adicional por horário;
- adicional por coleta distante;
- consumo de combustível de referência por categoria;
- preço do combustível;
- comissão;
- habilitação/desabilitação de categoria por rota;
- elegibilidade de veículo;
- faixas de Entrega em Jeri e preço acima da última faixa;
- data de vigência.

Nenhuma tabela comercial final deve ficar hardcoded apenas no aplicativo.
