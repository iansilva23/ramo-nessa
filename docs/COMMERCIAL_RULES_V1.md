# Regras Comerciais v1 — Ramo Nessa

Status: APROVADO para implementação.
Data-base: 2026-09-22.

Este documento é a fonte comercial de verdade da v1. Os valores abaixo devem ser servidos pelo Core/backend e administráveis pelo painel. O estimador local do Flutter é apenas técnico/de desenvolvimento até a integração definitiva.

## Regras globais

- Comissão Ramo Nessa: 10% do valor final cobrado no app.
- Repasse ao motorista/prestador: 90%.
- A comissão de 10% também incide sobre adicionais cobrados pelo app.
- Pagamento no lançamento: somente Pix, cartão e Carteira Ramo Nessa.
- Dinheiro: desativado no lançamento.
- Pix direto para o motorista: desativado.
- O serviço só entra em matching/despacho após pagamento confirmado ou valor devidamente autorizado/reservado pelo provedor.
- Gasolina de referência para compensação de coleta distante: R$ 7,00/L.
- Quando uma rota exige acesso 4x4 a Jericoacoara, não oferecer Carro comum.

## Compensação por motorista distante

O sistema sempre procura primeiro um motorista elegível próximo.

Até 3 km entre motorista e passageiro: sem adicional.

Acima de 3 km, adicionar apenas uma compensação de combustível do deslocamento excedente:

- Moto: referência 30 km/L -> aproximadamente R$ 0,23/km excedente.
- Carro: referência 9 km/L -> aproximadamente R$ 0,78/km excedente.

Fórmula:

```text
km_excedente = max(0, distancia_motorista_passageiro_km - 3)
adicional = ceil(km_excedente * preco_combustivel / consumo_km_l)
```

O valor deve ser mostrado ao passageiro antes da confirmação. O adicional integra o valor final e, pela regra comercial aprovada, também sofre a comissão padrão de 10%.

## Jericoacoara

### Táxi Buggy — dentro da Vila

Base dia: R$ 40 + R$ 2 por passageiro.
Após 22h: R$ 60 + R$ 2 por passageiro.
Máximo: 4 passageiros.

| Passageiros | Dia | Após 22h |
| ---: | ---: | ---: |
| 1 | R$ 42 | R$ 62 |
| 2 | R$ 44 | R$ 64 |
| 3 | R$ 46 | R$ 66 |
| 4 | R$ 48 | R$ 68 |

### Entrega de moto — dentro da Vila

| Distância retirada -> entrega | Preço |
| --- | ---: |
| até 0,7 km | R$ 5 |
| > 0,7 até 1,2 km | R$ 7 |
| > 1,2 até 1,6 km | R$ 8 |
| > 1,6 até 2,0 km | R$ 10 |

### Rotas 4x4

| Rota | Categoria | Dia | Após 22h |
| --- | --- | ---: | ---: |
| Jeri <-> Preá | Comfort/Black 4x4 | R$ 150 | R$ 200 |
| Jeri <-> Jijoca | Comfort/Black 4x4 | R$ 160 | R$ 200 |
| Jeri <-> Aeroporto JJD | Comfort/Black 4x4 | R$ 240 | R$ 240 |

Na rota Jeri <-> Aeroporto JJD não foi aprovado adicional noturno específico na v1; até nova configuração, o valor permanece R$ 240.

## Jijoca

### Moto e Entrega

Entrega de moto usa a mesma tarifa da Moto.

| Região/localidade | Moto | Entrega |
| --- | ---: | ---: |
| Dentro da sede / próximo | R$ 10 | R$ 10 |
| Vila São Paulo | R$ 15 | R$ 15 |
| Córrego da Forquilha I | R$ 15 | R$ 15 |
| Córrego do Urubu | R$ 15 | R$ 15 |
| Córrego da Forquilha II | R$ 20 | R$ 20 |
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

### Táxi/Carro local

| Região/localidade | Carro |
| --- | ---: |
| Dentro da sede / próximo | R$ 50 |
| Vila São Paulo | R$ 50 |
| Córrego da Forquilha I | R$ 55 |
| Córrego do Urubu | R$ 55 |
| Córrego da Forquilha II | R$ 60 |
| Carro Quebrado | R$ 60 |
| Baixio | R$ 65 |
| Córrego Perdido | R$ 70 |
| Cruzeiro do Brandão | R$ 75 |
| Córrego de Dentro | R$ 75 |
| Lagoa das Pedras | R$ 80 |
| Córrego do Mourão | R$ 85 |
| Chapadinha / região afastada | R$ 90 |
| Caminho para Mangue Seco | R$ 95 |
| Próximo ao Mangue Seco | R$ 95 |
| Mangue Seco / limite distante | R$ 100 |

Não foi aprovado adicional noturno próprio para a tabela local de Jijoca na v1.

### Corredores

| Rota | Categoria | Dia | Após 22h |
| --- | --- | ---: | ---: |
| Jijoca <-> Preá | Carro comum | R$ 120 | R$ 140 |
| Jijoca <-> Preá | Comfort/Black | R$ 170 | R$ 190 |
| Jijoca <-> Jeri | Comfort/Black 4x4 | R$ 160 | R$ 200 |

## Preá

### Moto e Entrega — localidades

Entrega usa a mesma tarifa da Moto.

| Destino | Moto | Entrega | Carro comum |
| --- | ---: | ---: | ---: |
| Preá | R$ 7 | R$ 7 | R$ 25 |
| Formosa | R$ 8 a R$ 10 | R$ 8 a R$ 10 | R$ 25 |
| Cavalo Bravo | R$ 8 a R$ 10 | R$ 8 a R$ 10 | R$ 25 |
| Caiçara | R$ 15 | R$ 15 | R$ 30 |
| Laguim | R$ 10 | R$ 10 | R$ 25 |
| Buraco Azul | R$ 20 | R$ 20 | R$ 35 |
| Caiçara de Baixo | R$ 30 | R$ 30 | R$ 45 |
| Córrego dos Anas | R$ 25 | R$ 25 | R$ 40 |
| Córrego das Panelas | R$ 50 | R$ 50 | R$ 60 |
| Guias Monteiros | R$ 35 | R$ 35 | R$ 45 |
| Aeroporto | R$ 60 | R$ 60 | R$ 70 |
| Cajueirinho | R$ 40 | R$ 40 | R$ 50 |
| Lagoa Azul | R$ 50 | R$ 50 | R$ 60 |
| Lagoa do Paraíso | R$ 100 | R$ 100 | R$ 110 |
| Jericoacoara | R$ 100 | R$ 100 | não oferecer carro comum |
| Castelhano | R$ 20 | R$ 20 | R$ 35 |
| IUS (nome a confirmar) | R$ 30 | R$ 30 | R$ 45 |
| Barrinha de Baixo | R$ 30 | R$ 30 | R$ 45 |
| Pinguela | R$ 30 | R$ 30 | R$ 45 |
| Lagamar | R$ 50 | R$ 50 | R$ 60 |
| Munzua | R$ 50 | R$ 50 | R$ 60 |
| Carrapateiras | R$ 35 | R$ 35 | R$ 45 |
| Aranaú | R$ 60 | R$ 60 | R$ 70 |

Carro local no Preá: +R$ 10 após 22h, exceto quando existir tarifa noturna específica da rota.

### Beira-Mar

| Destino | Moto | Entrega | Carro comum |
| --- | ---: | ---: | ---: |
| Preá Beach Villas | R$ 8 | R$ 8 | R$ 25 |
| Play Kitié | R$ 8 | R$ 8 | R$ 25 |
| Cabaña | R$ 8 | R$ 8 | R$ 25 |
| Ranchos | R$ 8 | R$ 8 | R$ 25 |
| Vila Preá | R$ 8 | R$ 8 | R$ 25 |
| Clube da Irrancha | R$ 10 | R$ 10 | R$ 30 |
| Casas Eli Lula | R$ 10 | R$ 10 | R$ 30 |
| D3 Luna | R$ 10 | R$ 10 | R$ 30 |
| Kite Lodge | R$ 12 | R$ 12 | R$ 30 |
| Beach House | R$ 15 | R$ 15 | R$ 35 |
| Vida ao Vento | R$ 15 | R$ 15 | R$ 35 |
| Casa de Praia Teto Branco | R$ 20 | R$ 20 | R$ 35 |

### Viagens mais longas — Carro comum

| Preá -> destino | Carro comum |
| --- | ---: |
| Jijoca | R$ 120 |
| Cruz | R$ 120 |
| Bela Cruz | R$ 180 |
| Acaraú | R$ 190 |
| Marco | R$ 250 |
| Triângulo do Marco | R$ 260 |
| Granja | R$ 260 |
| Itarema | R$ 260 |
| Morrinhos | R$ 320 |
| Camocim | R$ 350 |
| Amontada | R$ 360 |
| Santana do Acaraú | R$ 400 |
| Parazinha | R$ 480 |
| Itapipoca | R$ 500 |
| Sobral | R$ 520 |

Quando não houver tarifa noturna específica aprovada para uma viagem longa, a v1 usa o preço-base acima.

### Comfort/Black no Preá

Quando Carro comum e Comfort/Black puderem operar a mesma rota:

```text
Comfort/Black = preço do Carro comum + R$ 50
```

A categoria é voltada a veículos aprovados de padrão superior, incluindo 4x4 como Hilux/SW4 quando aplicável.

Exceção: rotas com acesso obrigatório 4x4 a Jeri não derivam de Carro comum; possuem preço próprio.

### Aeroporto JJD

| Rota | Carro comum | Comfort/Black |
| --- | ---: | ---: |
| Aeroporto JJD <-> Preá | R$ 180 | R$ 230 |
| Aeroporto JJD <-> Jeri | indisponível | R$ 240 |

## Elegibilidade e acesso

Preço nunca substitui autorização operacional.

O backend deve impedir oferta de categoria/veículo incompatível com a rota. Em especial, rotas que entram em Jericoacoara e exigem 4x4 devem ocultar Carro comum e oferecer somente motoristas/veículos elegíveis.

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
- data de vigência.

Nenhuma tabela comercial final deve ficar hardcoded apenas no aplicativo.
