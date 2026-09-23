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
   - PostgreSQL, máquina de estados, matching, ledger/carteira, realtime e sessão Bearer já existem;
   - autenticação por telefone/OTP já existe, mas falta configurar o provider SMS real de produção e o segredo OTP;
   - falta gateway real, conciliação e repasse Pix;
   - falta observabilidade, hardening de deploy e infraestrutura de produção.

2. **Fluxo Passageiro ↔ Motorista já usa sessão real, mas precisa validação operacional**
   - Passageiro e Motorista suportam login OTP, sessão Bearer, restauração segura e logout com revogação;
   - headers `x-dev-*` permanecem apenas como fallback explícito fora de produção;
   - motorista não é criado automaticamente: precisa ser provisionado/aprovado antes do OTP;
   - antes do beta público, validar login, corrida e realtime em dois aparelhos físicos.

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
   - Motorista possui host iOS com Keychain e localização em segundo plano configurados e foi validado em Simulator pelo CI;
   - falta Apple Developer Team, assinatura de distribuição e aparelho físico para os dois apps.

7. **Mapas/rotas ainda usam infraestrutura pública de desenvolvimento**
   - OpenStreetMap tiles;
   - Nominatim;
   - OSRM demo server;
   - antes do lançamento é necessário provedor/infraestrutura adequada ao uso comercial.

8. **Privacidade, LGPD e operação da autenticação**
   - sessão Bearer, expiração, revogação e token em Keychain/Keystore já existem; sessões expiradas/revogadas fora da retenção são limpas automaticamente;
   - código OTP fica armazenado somente como HMAC no Core, tem expiração/limite de tentativas e desafios antigos são removidos automaticamente;
   - falta provider SMS real e credenciais de produção;
   - o Core aplica cooldown atômico e rate-limit persistente por telefone, dispositivo e IP, remove buckets expirados e evita revelar por resposta OTP se um cadastro de motorista existe/está suspenso; o provider/edge de produção deve manter proteção adicional contra abuso;
   - falta painel/processo administrativo para aprovar/suspender motorista;
   - faltam consentimentos, política de privacidade, termos, retenção e exclusão de dados.

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
