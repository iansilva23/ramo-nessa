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
   - Push FCM já existe no Core e nos dois apps, com registro de token, renovação, invalidação e status seguro no Admin; para produção ainda faltam `PUSH_PROVIDER=fcm`, Service Account Firebase privada no Core e os Secrets Firebase de build dos apps;
   - na auditoria de 27/09/2026, Preview Android e iOS compilaram com sucesso, mas os logs confirmaram ausência dos Secrets `RAMO_FIREBASE_*`, portanto esses binários foram gerados com Push desativado; o `Mobile Build Audit` final bloqueia release enquanto a configuração obrigatória estiver ausente;
   - Pix/cartão para corridas já possuem integração com o gateway; ainda faltam confirmação real de recarga, conciliação operacional completa, validação externa dos estornos e repasse Pix, conforme o item financeiro abaixo;
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

4. **Gateway financeiro real está integrado, mas depende da operação externa**
   - Pix/cartão/carteira são a política aprovada e o ledger/carteira internos já existem;
   - Pix usa Orders API no Core e cartão usa tokenização nativa do Mercado Pago; a Public Key pode ser administrada no ADM e consumida dinamicamente pelo Passenger, com fallback do build;
   - Access Token e webhook secret continuam restritos ao ambiente seguro do Core e não aparecem no ADM nem nos apps;
   - o Admin mantém ledger e pagamentos históricos somente leitura; políticas financeiras e o fluxo legítimo de conclusão/cancelamento de saques são administráveis, sem edição arbitrária do ledger;
   - dinheiro continua desativado por padrão; o fluxo cash de dívida, limite, compensação e liquidação já existe e a ativação é manual e auditada no Admin;
   - ainda faltam configurar credenciais reais, webhook no domínio público, validar sandbox externo e implementar a confirmação real de recarga da carteira;
   - por segurança, o Passageiro consulta e usa o saldo existente, mas o app não oferece botão de recarga enquanto a intenção criada pelo Core continuar `simulated: true` e `actionable: false`; a interface de recarga só deve ser liberada junto da confirmação real do gateway;
   - cancelamento administrativo antes do início da viagem já existe: carteira é estornada internamente e Pix/cartão usam `REFUND_PENDING` até confirmação; solicitação de estorno integral e reconciliação da confirmação Orders já existem no Core, inclusive retry idempotente;
   - ainda é necessário validar pagamento/estorno no sandbox externo e domínio público; conciliação operacional completa, tratamento operacional de chargebacks/estornos parciais e repasse Pix real continuam pendentes.

5. **Assinatura Android de produção ainda não existe**
   - a auditoria removeu o fallback de release para chave debug;
   - builds sem keystore servem apenas para validação técnica e não devem ser distribuídos;
   - a keystore de produção deve ficar fora do Git e ser injetada somente na publicação.

6. **Cobertura iOS é parcial**
   - Passageiro foi validado em Simulator;
   - Motorista possui host iOS com Keychain e localização em segundo plano configurados e foi validado em Simulator pelo CI;
   - falta Apple Developer Team, assinatura de distribuição e aparelho físico para os dois apps.

7. **Google Maps Platform está integrado, mas falta configuração comercial de produção**
   - Passenger e Driver renderizam com Google Maps SDK via `google_maps_flutter`;
   - Places e Routes passam pelo Core, sem expor a chave de servidor nos apps;
   - CI/Test Stack usa mock local para não consumir APIs pagas;
   - antes do lançamento faltam chaves de produção restritas, billing/quotas, alertas de custo e validação em aparelhos físicos.

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
   - inspeção segura já existe no Core/Admin: sessão humana obrigatória, token criptografado curto, proxy `no-store`, validação de hash/MIME/tamanho/assinatura e preview temporário; o stack E2E usa um storage privado de teste;
   - upload de CNH/CRLV no app e no Core já existe, com validação de conteúdo e status pendente; os adapters de storage HTTP privado e diretório privado também existem;
   - ainda faltam configurar storage privado persistente, permissões, backup/retenção e validar envio/revisão no ambiente final, além de concluir o onboarding operacional;
   - o Admin já cobre histórico/cancelamento seguro de viagens, bloqueios de acesso, auditoria, ledger histórico protegido e inspeção segura de documentos; ainda falta a implantação operacional e demais itens de Go-Live;
   - faltam consentimentos, política de privacidade, termos, retenção e exclusão de dados.

9. **Testes reais ainda faltam**
   - Android físico;
   - iPhone físico;
   - GPS real;
   - internet ruim;
   - fechamento/reabertura;
   - troca de rede;
   - dois aparelhos simultâneos Passageiro/Motorista;
   - entrega real de Push FCM em Android e iPhone, incluindo app aberto, background e token renovado;
   - cenários reais de pagamento e cancelamento.

10. **Regras de acesso/eligibilidade e geografia**
   - preço não substitui autorização operacional;
   - o Core já valida categoria, lotação, disponibilidade e 4x4 antes da oferta;
   - disponibilidade de categorias e exigência 4x4 ao cruzar Jeri já são políticas versionadas e publicáveis pelo Admin;
   - cada corrida congela sua exigência 4x4 para não mudar com versões futuras;
   - falta um catálogo geoespacial autoritativo para validar a localidade exata de todas as tarifas locais/externas, além da validação de zona/GPS já implementada.

## Suporte e separação Preview/real

- Motoristas e passageiros abrem e acompanham chamados autenticados nos respectivos apps;
- o ADM usa uma única fila paginada, identifica o tipo de solicitante, responde e registra a ação na auditoria;
- as referências de motorista e passageiro permanecem protegidas por foreign keys próprias no PostgreSQL;
- o Passenger normal compartilha os serviços autenticados entre Início e Perfil; os serviços privados nunca são selecionados por uma sessão Preview;
- no Preview, o suporte é temporário e local, com aviso explícito de que não envia à equipe. Isso não substitui o teste operacional com Core real;
- resposta salva no chamado não comprova entrega de Push: FCM continua dependendo da configuração e do aparelho;
- falhas de consulta do suporte mostram erro/retry, não lista vazia nem dados antigos como se estivessem atualizados.

## Regra do projeto

Nenhum item deve ser considerado concluído apenas porque o app compila. Pagamento, preço final, elegibilidade, despacho e estado da corrida devem ser validados pelo Core.
