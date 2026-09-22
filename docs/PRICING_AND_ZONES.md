# Zonas e preço — MVP Passageiro

## Fonte comercial vigente

A especificação aprovada de preços e regras comerciais está em:

- `docs/COMMERCIAL_RULES_V1.md`
- `docs/PAYMENTS_AND_COMMISSION_V1.md`

Esses documentos substituem os antigos pisos provisórios de corredor como referência comercial.

## Estado atual do aplicativo

O Passageiro já possui:

- origem por GPS;
- origem manual pela busca;
- destino manual;
- validação da área atendida;
- rota, distância e ETA reais em desenvolvimento;
- Carro, Moto e Entrega no fluxo atual;
- estimativa local técnica.

A estimativa local do Flutter **não é o preço comercial final**. Ela existe apenas para UX/testes enquanto o Core/backend autoritativo ainda não foi implementado.

## Área operacional inicial

Zonas atuais do MVP:

- Jericoacoara;
- Jijoca;
- Preá.

As geofences existentes no cliente são raios operacionais de desenvolvimento. Elas não representam limites administrativos nem substituem as futuras zonas/localidades configuráveis do backend.

## Modelo comercial aprovado

A v1 exige mais do que uma fórmula simples por km. O backend deverá suportar:

1. tarifas fixas por origem/destino/localidade;
2. categorias diferentes por rota;
3. preço por janela de horário;
4. rotas exclusivas para Comfort/Black 4x4;
5. tabela de Moto e Entrega por localidade;
6. Comfort/Black derivado de Carro comum (+R$ 50) quando ambos forem permitidos;
7. compensação de combustível quando o único motorista elegível estiver distante;
8. comissão de 10%;
9. versionamento e vigência de tabela.

Por isso a antiga lógica `base + km + minuto + piso de corredor` não deve ser usada como autoridade comercial.

## Jericoacoara e elegibilidade

Preço não equivale a autorização de operação.

O Core deverá filtrar motoristas e veículos elegíveis antes do matching. Onde a rota exigir 4x4, Carro comum não deve ser exibido nem receber oferta.

## Implementação necessária

Antes do lançamento:

- criar catálogo autoritativo de preços no backend;
- modelar localidades/zonas e corredores direcionais/bidirecionais;
- adicionar Comfort/Black e Buggy ao domínio;
- modelar janela após 22h;
- implementar compensação de coleta distante;
- implementar comissão, carteira e pagamentos;
- versionar cada cotação;
- registrar a regra usada em cada corrida;
- permitir configuração pelo Admin;
- remover dependência comercial do estimador local.

O cliente Flutter deve exibir a cotação assinada/confirmada pelo Core.
