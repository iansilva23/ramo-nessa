# Zonas e preço — MVP Passageiro

## Estado atual

O Passageiro já possui:

- origem por GPS;
- origem manual pela busca;
- destino manual;
- validação da área atendida;
- rota, distância e ETA pelo OSRM;
- estimativa local para Carro, Moto e Entrega.

A estimativa continua sendo **provisória**. O preço autoritativo de produção deverá ser calculado pelo Core/backend e enviado ao app.

## Área operacional inicial

Zonas configuradas no cliente para o MVP:

- Jericoacoara;
- Jijoca;
- Preá.

As geofences atuais são raios operacionais que se sobrepõem para cobrir a região local. Elas não representam limites administrativos.

A evolução prevista é mover as zonas para o backend/Admin e usar polígonos configuráveis sem publicar uma nova versão do app.

## Regra de preço local

O cálculo de referência usa:

```text
estimativa = tarifa_base
           + distancia_km * valor_por_km
           + duracao_min * valor_por_minuto
```

Depois são aplicados:

1. tarifa mínima da categoria;
2. piso do corredor entre zonas, quando existir;
3. arredondamento para dezenas de centavos.

### Tabela técnica do piloto

| Categoria | Base | Por km | Por minuto | Mínimo local |
| --- | ---: | ---: | ---: | ---: |
| Carro | R$ 6,50 | R$ 2,50 | R$ 0,25 | R$ 12,00 |
| Moto | R$ 4,00 | R$ 1,50 | R$ 0,18 | R$ 8,00 |
| Entrega | R$ 5,00 | R$ 1,80 | R$ 0,18 | R$ 9,50 |

### Pisos provisórios por corredor

| Corredor | Carro | Moto | Entrega |
| --- | ---: | ---: | ---: |
| Jeri ↔ Preá | R$ 55,00 | R$ 30,00 | R$ 35,00 |
| Jeri ↔ Jijoca | R$ 80,00 | R$ 50,00 | R$ 60,00 |
| Jijoca ↔ Preá | R$ 85,00 | R$ 55,00 | R$ 65,00 |

Esses pisos existem para evitar que pequenas diferenças de roteamento ou tempo em vias locais/areia produzam valores anormalmente baixos.

## Atenção: acesso a Jericoacoara

Preço não equivale a autorização de operação.

A Vila possui regras próprias de circulação e transporte. Quando o matching real for implementado, o backend deverá filtrar motoristas/veículos elegíveis para a zona antes de oferecer uma corrida.

Nenhuma regra de preço deve permitir que um veículo não autorizado seja selecionado para uma operação restrita.

## Próxima evolução

Antes do lançamento:

- mover tarifa-base, km, minuto, mínimos e pisos de corredor para o backend/Admin;
- versionar cada tabela;
- registrar a versão usada em cada cotação;
- adicionar comissão e repasse;
- definir cancelamento;
- definir regras de pico somente se houver necessidade operacional;
- permitir ativar/desativar categorias por zona;
- fazer o servidor recalcular e assinar a cotação.

O Flutter deve tratar a estimativa local apenas como UX de desenvolvimento.
