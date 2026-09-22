# Zonas e preço — Passageiro + Core

## Fonte comercial vigente

A especificação aprovada está em:

- `docs/COMMERCIAL_RULES_V1.md`
- `docs/PAYMENTS_AND_COMMISSION_V1.md`

Esses documentos são a referência comercial da v1.

## Estado implementado

O Passageiro já possui:

- origem por GPS e origem manual;
- destino manual;
- busca local limitada a Jeri/Jijoca/Preá e entorno;
- busca externa liberada somente para destinos longos presentes na tabela aprovada;
- Aeroporto JJD;
- rota, distância e ETA em ambiente de desenvolvimento;
- Carro, Moto, Entrega, Comfort/Black e Buggy;
- filtro de categorias por elegibilidade comercial da rota;
- contador de 1 a 4 passageiros no Buggy;
- cotação HTTP pelo Ramo Nessa Core;
- bloqueio de despacho quando a cotação não é exata;
- nenhum preço comercial autoritativo calculado localmente no Flutter.

O Core já implementa:

- catálogo comercial v1;
- preços fixos por localidade/corredor;
- regras após 22h aprovadas;
- Comfort/Black quando permitido;
- compensação de coleta distante;
- comissão de 10%;
- política de pagamentos digitais;
- endpoint de cotação;
- testes e CI.

## Área operacional

As geofences locais do cliente continuam sendo raios operacionais do MVP, não limites administrativos.

A cobertura inicial reconhecida pelo app inclui:

- Jericoacoara;
- Jijoca;
- Preá;
- Aeroporto JJD;
- destinos longos explicitamente aprovados na tabela comercial, quando pesquisados por nome.

Um ponto externo aleatório não vira rota atendida apenas por estar no Ceará.

## Modelo comercial

A v1 não usa uma fórmula simples de `base + km + minuto` como autoridade.

O Core resolve a tarifa por:

1. origem/destino/localidade;
2. categoria permitida;
3. janela de horário;
4. regra 4x4 quando aplicável;
5. quantidade de passageiros no Buggy;
6. compensação por coleta distante;
7. comissão da plataforma;
8. regra comercial identificável pelo `ruleId`.

Faixas ainda não fechadas, como localidades com preço "R$ X a R$ Y", são retornadas como faixa e não podem ser despachadas como se fossem um preço exato.

## Elegibilidade

Preço não equivale a autorização operacional.

O app já oculta categorias comercialmente incompatíveis com a rota. O backend ainda deverá validar o veículo e o motorista concretos antes do matching, especialmente nas rotas que exigem 4x4 em Jericoacoara.

## Próximas implementações

Ainda faltam:

- persistência/versionamento de tabelas e cotações;
- Admin para alterar preços e vigência;
- validação robusta de schema da API;
- autenticação/autorização;
- disponibilidade e matching real;
- integração de Pix/cartão/carteira;
- ledger, estornos, repasses e conciliação;
- resolução de motorista distante antes da cobrança final;
- deploy seguro do Core;
- provedor comercial de mapas/geocoding/rotas.

O preço, a comissão e a elegibilidade final devem continuar sob autoridade do Core.
