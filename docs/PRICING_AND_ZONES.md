# Zonas e preço — MVP Passageiro

## Área operacional

O app valida origem e destino antes de chamar a rota.

Zonas configuradas no cliente para o MVP:

- Jericoacoara
- Jijoca
- Preá

As geofences atuais são raios operacionais que se sobrepõem para cobrir a região local. Elas não representam limites administrativos. A evolução prevista é mover essas zonas para o backend/Admin e usar polígonos configuráveis sem precisar publicar uma nova versão do app.

A busca do Nominatim também fica limitada ao recorte de Jeri/Jijoca/Preá e entorno, evitando que o passageiro receba resultados do restante do Brasil no fluxo normal.

## Origem

A origem pode ser:

1. a localização GPS atual; ou
2. um lugar escolhido manualmente pela mesma busca usada para o destino.

Trocar a origem invalida a rota anterior e força novo cálculo.

## Estimativa de preço

O valor agora é calculado a partir da rota retornada pelo OSRM:

```text
estimativa = tarifa_base
           + distancia_km * valor_por_km
           + duracao_min * valor_por_minuto
```

Depois é aplicada a tarifa mínima da categoria e o resultado é arredondado para dezenas de centavos.

As três categorias possuem cartões de tarifa independentes:

- Carro
- Moto
- Entrega

### Importante

Os coeficientes atuais são configuração técnica de desenvolvimento do MVP. Eles ainda não são uma tabela comercial aprovada.

Antes de produção, os valores devem ser controlados pelo backend/Admin, versionados e associados à área/horário/regras comerciais. O aplicativo deve receber a cotação pronta ou assinada pelo servidor para impedir manipulação no cliente.

## Regra de segurança futura

A estimativa local serve para UX durante o desenvolvimento. O preço definitivo de uma corrida nunca deve ser autoritativo no Flutter. Quando o Core estiver conectado, o servidor recalculará a cotação com a mesma versão de tabela e devolverá o valor válido para a solicitação.
