# Revisão comercial aprovada por Ian — 03/10/2026

Novas cotações usam `approved-2026-10-03`. A matriz independente `backend/core/test/approved_commercial_revision.test.ts` registra todos os valores aprovados e testa ida/volta, dia/noite e passageiros. Corridas anteriores preservam preço congelado.

- Dia 06h–22h; noite 22h–06h, America/Fortaleza.
- Todos os motoristas aprovados operam nas regiões compatíveis com categoria/veículo, GPS e capacidade. Sem liberação individual de zona.
- Dentro de Jeri: Buggy e Entrega. Sem Mototáxi de passageiros. Carro/Comfort 4x4 fazem apenas transfers entre Jeri e Preá, Jijoca, JJD e Fortaleza.
- Buggy Jeri: R$35/R$50 para uma pessoa, +R$2 por adicional, até quatro. Preá: mínimo R$25, tabela por localidade, +R$5 à noite, +R$2 por passageiro adicional. Jeri/Preá R$110/R$150 por veículo.
- Carro local Preá: Buggy diurno para uma pessoa +R$5; noite mais R$5. Comfort adiciona R$25 ao Carro de cada horário.
- Moto Preá: diurno mantido; sede/Formosa/Cavalo Bravo R$7/R$16,60. Beira-Mar e cidades externas +60% à noite; demais localidades e aeroporto +40%. Jijoca R$60/R$96. Sem Moto para passageiros em Jeri.
- Jijoca: Moto/Carro com diurno mantido e noite +30%. Mourão Moto R$40/R$52; Chapadinha R$45/R$58,50. Comfort local soma R$17 ao Carro após o adicional noturno.
- Entrega Jeri: R$5 até 2km e R$6 acima. Preá/Jijoca: R$6 até 5km e R$1 por km excedente, proporcional ao centavo. Sem noturno. Distância roteada retirada/entrega pelo Core.
- Viagens longas do Preá para as cidades aprovadas: Carro mantido, Comfort +30%, fixos sem noturno.

## Transfers por veículo, até quatro passageiros

| Rota nos dois sentidos | Carro dia/noite | Comfort dia/noite |
|---|---:|---:|
| Jeri/Preá | 130/150 | 150/190 |
| Jeri/Jijoca | 140/160 | 160/200 |
| Jeri/JJD | 200/200 | 220/220 |
| Jeri/Fortaleza | 800/800 | 825/825 |
| Preá/Jijoca | 120/140 | 150/170 |
| Preá/JJD | 70/70 | 90/90 |

## Compartilhado e publicação

Botão pequeno “Compartilhado · Valor mais acessível”, sem anunciar preço. A agência combina valor, horário, reserva e pagamento no WhatsApp. ADM controla ativação, número, texto, mensagem e sentidos, com versão/auditoria. Padrão desativado até cadastrar número. Rotas preparadas saindo de Jeri para JJD/Fortaleza; volta pode ser incluída pelo ADM e não foi confirmada para esse encaminhamento. Abrir contato no pagamento libera a reserva privada ainda não paga.

Uma versão efetiva do ADM prevalece sobre o fallback. `node dist/scripts/apply-approved-pricing.js` simula; `--apply` publica em transação com auditoria atribuída a ADMIN_OWNER_USER_ID. Reexecução preserva edições posteriores da revisão. Áreas existentes e histórico permanecem. Geofences são administráveis por alfinete/raio, sem inventar coordenadas de comunidades. Aplicativo recebe as áreas do Core e usa a mesma prioridade nas sobreposições.

Transporte entre duas localidades sem sede/rota explícita permanece indisponível: não inventar preços não definidos. Entrega entre localidades usa distância. Comissão, cupons, ajustes de pagamento e compensação de coleta continuam separados da tarifa-base.
