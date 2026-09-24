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
   - readiness, logs estruturados, shutdown gracioso e container de produção já existem;
   - existe stack Docker same-origin para teste controlado do Admin + Core, com smoke E2E efêmero;
   - ainda faltam coleta/alertas/APM, infraestrutura hospedada e operação do deploy de produção.

2. **Fluxo Passageiro ↔ Motorista já usa sessão real, mas precisa validação operacional**
   - Passageiro e Motorista suportam login OTP, sessão Bearer, restauração segura e logout com revogação;
   - headers `x-dev-*` permanecem apenas como fallback explícito fora de produção;
   - motorista não é criado automaticamente: precisa ser provisionado/aprovado antes do OTP;
   - antes do beta público, validar login, corrida e realtime em dois aparelhos físicos.

3. **Preço v1 existe, mas a operação ainda precisa de infraestrutura**
   - o Core já contém a regra comercial;
   - o Passageiro consulta o Core quando `RAMO_CORE_BASE_URL` está configurado;
   - o Admin já possui catálogo ativo protegido, rascunhos editáveis, versionamento persistente, publicação auditada, vigência imediata/programada e edição estrutural versionada das zonas/localidades suportadas; ainda falta resolução geoespacial robusta de todas as localidades externas;
   - faixas comerciais que ainda não possuem valor único não podem virar cobrança exata automaticamente.

4. **Gateway financeiro real ainda não foi integrado**
   - Pix/cartão/carteira são a política aprovada e o ledger/carteira internos já existem;
   - o Admin já possui visão financeira somente leitura baseada no ledger, sem ações de mutação financeira;
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
   - o Core já possui processo administrativo via API/CLI com chaves com expiração/revogação, escopos e auditoria, além de login humano com senha + TOTP + sessão curta conectado às operações administrativas;
   - o frontend inicial cobre login, diretórios paginados de acesso de motoristas e passageiros, indicadores de aprovação/suspensão e auditoria, e já possui stack same-origin de teste;
   - o Core e o Admin já possuem cadastro separado de perfil do motorista + veículo, com aprovação explícita e auditoria;
   - o Core já possui metadados/revisão de CNH e CRLV com histórico de versões e sem expor referência privada ao browser;
   - o Admin já consulta somente metadados sanitizados e registra a decisão humana de aprovação/rejeição, sem receber storageKey ou hash do arquivo;
   - ainda faltam storage privado, upload real, acesso/preview seguro do arquivo, validação do conteúdo e integração completa dessa aprovação com o onboarding final;
   - ainda faltam os módulos administrativos completos e a implantação operacional de produção;
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
   - disponibilidade de categorias e exigência 4x4 ao cruzar Jeri já são políticas versionadas e publicáveis pelo Admin;
   - cada corrida congela sua exigência 4x4 para não mudar com versões futuras;
   - falta um catálogo geoespacial autoritativo para validar a localidade exata de todas as tarifas locais/externas, além da validação de zona/GPS já implementada.

## Regra do projeto

Nenhum item deve ser considerado concluído apenas porque o app compila. Pagamento, preço final, elegibilidade, despacho e estado da corrida devem ser validados pelo Core.
