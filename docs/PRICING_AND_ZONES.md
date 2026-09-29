# Zonas e preço — Passageiro + Core

## Base comercial em revisão

A implementação atual está documentada em:

- `docs/COMMERCIAL_RULES_V1.md`
- `docs/PAYMENTS_AND_COMMISSION_V1.md`

Esses documentos descrevem a base técnica vigente no Core, mas valores e regras sujeitos à revisão comercial não devem ser tratados como tabela oficial até aprovação explícita.

## Estado implementado

O Passageiro já possui:

- origem por GPS e origem manual;
- destino manual;
- busca local limitada a Jeri/Jijoca/Preá e entorno;
- busca externa liberada somente para destinos longos presentes na base comercial atualmente implementada;
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

O app oculta categorias comercialmente incompatíveis e o Core também valida categoria, lotação, disponibilidade, localização recente e 4x4 no matching. A auditoria de 23/09 adicionou ainda validação entre zona local declarada e coordenadas antes de congelar a tarifa. A validação geográfica exata de cada localidade específica continua dependendo de um catálogo geoespacial autoritativo.

## Estado de implementação e pendências de produção

Já estão implementados no Core/ADM:

- persistência e versionamento do catálogo comercial em PostgreSQL;
- rascunhos, edição administrativa, publicação e vigência de versões;
- autenticação/sessão e autorização por escopos;
- matching e máquina de estados autoritativos;
- ledger/carteira e fluxo de repasses;
- integração estrutural de Pix/cartão, estorno e reconciliação;
- Google Maps/Places/Routes integrados ao fluxo de mobilidade.

Ainda dependem de fechamento operacional ou infraestrutura externa:

- catálogo geoespacial autoritativo para todas as localidades específicas e destinos externos;
- credenciais e homologação comercial dos provedores de pagamento;
- provider OTP/SMS real de produção;
- Firebase/Push/APNs com credenciais finais;
- storage privado persistente para documentos;
- infraestrutura hospedada, backup, monitoramento e alertas;
- chaves/restrições/billing de produção do Google Maps;
- testes físicos, piloto controlado e preparação das lojas.

Os valores e regras comerciais que ainda aguardam decisão oficial não devem ser tratados como confirmados apenas porque existe infraestrutura de edição no ADM.

O preço, a comissão e a elegibilidade final continuam sob autoridade do Core.
