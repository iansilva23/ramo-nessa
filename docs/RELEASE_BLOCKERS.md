# Bloqueios atuais de publicação

Este arquivo separa **código implementado** de **prontidão comercial**.

O Ramo Nessa ainda não deve ser publicado como produto final.

## O que já existe

- Passageiro Flutter Android/iOS;
- mapa, GPS, busca, rota, distância e ETA em desenvolvimento;
- Core inicial em Node.js + TypeScript;
- motor comercial v1 e comissão de 10%;
- regras de Moto, Entrega, Carro, Comfort/Black e Buggy;
- cliente do Passageiro para cotação pelo Core;
- política digital de pagamentos definida em código;
- CI para Passageiro/Design System e Core.

## Bloqueios obrigatórios

1. **Core ainda não está pronto para produção**
   - PostgreSQL, máquina de estados, matching, ledger/carteira e realtime já existem;
   - falta autenticação/autorização real;
   - falta gateway real, estornos/conciliação e repasse Pix;
   - falta observabilidade, hardening de deploy e infraestrutura de produção.

2. **Fluxo Passageiro ↔ Motorista existe, mas ainda usa identidade de desenvolvimento**
   - o protótipo fake de "motorista encontrado" foi removido;
   - pagamento por carteira já aciona matching/despacho e tracking reais do Core;
   - antes de beta público, substituir headers de identidade dev por autenticação real e validar o fluxo em dois aparelhos físicos.

3. **Preço v1 existe, mas a operação ainda precisa de infraestrutura**
   - o Core já contém a regra comercial;
   - o Passageiro consulta o Core quando `RAMO_CORE_BASE_URL` está configurado;
   - ainda faltam deploy, Admin, persistência/versionamento e resolução robusta de todas as localidades externas;
   - faixas comerciais que ainda não possuem valor único não podem virar cobrança exata automaticamente.

4. **Gateway financeiro real ainda não foi integrado**
   - Pix/cartão/carteira são a política aprovada e o ledger/carteira internos já existem;
   - dinheiro está desativado no lançamento;
   - falta integrar gateway para Pix/cartão e confirmação real de recarga;
   - faltam estorno/chargeback, conciliação e repasse Pix real.

5. **Assinatura Android de produção ainda não existe**
   - a auditoria removeu o fallback de release para chave debug;
   - builds sem keystore servem apenas para validação técnica e não devem ser distribuídos;
   - a keystore de produção deve ficar fora do Git e ser injetada somente na publicação.

6. **Cobertura iOS é parcial**
   - Passageiro foi validado em Simulator;
   - falta Apple Developer Team, assinatura de distribuição e aparelho físico;
   - o app Motorista ainda não possui estrutura iOS no repositório.

7. **Mapas/rotas ainda usam infraestrutura pública de desenvolvimento**
   - OpenStreetMap tiles;
   - Nominatim;
   - OSRM demo server;
   - antes do lançamento é necessário provedor/infraestrutura adequada ao uso comercial.

8. **Autenticação, privacidade e LGPD**
   - conta do usuário;
   - consentimentos;
   - política de privacidade;
   - termos;
   - retenção e exclusão de dados.

9. **Testes reais ainda faltam**
   - Android físico;
   - iPhone físico;
   - GPS real;
   - internet ruim;
   - fechamento/reabertura;
   - troca de rede;
   - dois aparelhos simultâneos Passageiro/Motorista;
   - cenários reais de pagamento e cancelamento.

10. **Regras de acesso/eligibilidade e geografia**
   - preço não substitui autorização operacional;
   - o Core já valida categoria, lotação, disponibilidade e 4x4 antes da oferta;
   - falta um catálogo geoespacial autoritativo para validar a localidade exata de todas as tarifas locais/externas, além da validação de zona/GPS já implementada.

## Regra do projeto

Nenhum item deve ser considerado concluído apenas porque o app compila. Pagamento, preço final, elegibilidade, despacho e estado da corrida devem ser validados pelo Core.
