# Bloqueios atuais de publicação

Este arquivo separa **código implementado** de **prontidão comercial**.

O Ramo Nessa ainda não deve ser publicado como produto final.

## O que já existe

- Passageiro Flutter Android/iOS;
- mapa, GPS, busca, rota, distância e ETA em desenvolvimento;
- Core em Node.js + TypeScript com PostgreSQL, autenticação, matching, realtime, ledger/carteira e máquina de estados;
- motor comercial v1 e comissão de 10%;
- regras de Moto, Entrega, Carro, Comfort/Black e Buggy;
- cliente do Passageiro para cotação pelo Core;
- política digital de pagamentos definida em código;
- CI para Core, Admin, Design System, Passageiro e Motorista, com Preflight, Test Stack Audit, Preview APKs e auditoria iOS.

## Bloqueios obrigatórios

1. **Core ainda não está pronto para produção**
   - PostgreSQL, máquina de estados, matching, ledger/carteira, realtime e sessão Bearer já existem;
   - autenticação por telefone/OTP já existe; produção força webhook HTTPS autenticado, possui contrato versionado, idempotency-key, retry limitado para falhas transitórias e invalida a challenge quando a entrega falha; ainda falta configurar/homologar o provider SMS real e suas credenciais;
   - Push FCM já existe no Core e nos dois apps, com registro de token, renovação, invalidação e status seguro no Admin; o perfil `deploy/prod` exige `PUSH_PROVIDER=fcm`, Service Account privada montada somente no Core e valida o JSON/permissões antes do deploy; o `Mobile Build Audit` exige App IDs específicos/coerentes por app-plataforma e o Preflight protege os entitlements iOS; o fechamento operacional está em `docs/FIREBASE_PUSH_PRODUCTION.md`; ainda faltam credenciais reais, configuração APNs/Apple Developer e homologação em aparelhos físicos;
   - na auditoria de 27/09/2026, Preview Android e iOS compilaram com sucesso, mas os logs confirmaram ausência dos Secrets `RAMO_FIREBASE_*`, portanto esses binários foram gerados com Push desativado; o `Mobile Build Audit` final bloqueia release enquanto a configuração obrigatória estiver ausente;
   - Pix/cartão para corridas e recarga de carteira já possuem integração estrutural com o gateway; ainda faltam homologação externa da confirmação de recarga, conciliação operacional completa, validação externa dos estornos e repasse Pix, conforme o item financeiro abaixo;
   - readiness, logs estruturados, shutdown gracioso e container de produção já existem;
   - existe stack Docker same-origin para teste controlado do Admin + Core, com smoke E2E efêmero;
   - o repositório já possui `deploy/prod` com PostgreSQL privado, migrations separadas, Core privado, volume persistente de documentos, gateway Caddy/TLS, gerador de segredos e validação de ambiente; o stack ainda não foi implantado em VPS;
   - o baseline operacional já inclui rotação de logs Docker, hardening do Core/migrations, backup consistente de PostgreSQL + documentos privados com SHA-256, verificação sem restore e health check HTTPS;
   - ainda faltam executar e validar esses procedimentos no VPS real, teste de recuperação em ambiente isolado, retenção/off-site de backups e alertas/APM externos.

2. **Fluxo Passageiro ↔ Motorista já usa sessão real, mas precisa validação operacional**
   - Passageiro e Motorista suportam login OTP, sessão Bearer, restauração segura e logout com revogação;
   - headers `x-dev-*` permanecem apenas como fallback explícito fora de produção;
   - motorista não é criado automaticamente: precisa ser provisionado/aprovado antes do OTP;
   - antes do beta público, validar login, corrida e realtime em dois aparelhos físicos.

3. **Preço v1 existe, mas a operação ainda precisa de infraestrutura**
   - o Core já contém a regra comercial;
   - o Passageiro consulta o Core quando `RAMO_CORE_BASE_URL` está configurado;
   - o Admin já possui catálogo ativo protegido, rascunhos editáveis, versionamento persistente, publicação auditada, vigência imediata/programada e edição estrutural versionada das zonas/localidades suportadas;
   - destinos externos aprovados e localidades locais reconhecidas via Google Places já recebem prova assinada pelo Core, vinculada à localidade e coordenadas; ainda falta ampliar a cobertura geoespacial para GPS puro e pontos não reconhecidos pelo catálogo de lugares;
   - faixas comerciais que ainda não possuem valor único não podem virar cobrança exata automaticamente.

4. **Gateway financeiro real está integrado, mas depende da operação externa**
   - Pix/cartão/carteira são a política aprovada e o ledger/carteira internos já existem;
   - Pix usa Orders API no Core e cartão usa tokenização nativa do Mercado Pago; a Public Key pode ser administrada no ADM e consumida dinamicamente pelo Passenger, com fallback do build;
   - Access Token e webhook secret continuam restritos ao ambiente seguro do Core e não aparecem no ADM nem nos apps;
   - o Admin mantém ledger e pagamentos históricos somente leitura; políticas financeiras e o fluxo legítimo de conclusão/cancelamento de saques são administráveis, sem edição arbitrária do ledger;
   - dinheiro continua desativado por padrão; o fluxo cash de dívida, limite, compensação e liquidação já existe e a ativação é manual e auditada no Admin;
   - ainda faltam configurar credenciais reais, webhook no domínio público e validar no sandbox externo a confirmação de recarga da carteira já implementada no Core;
   - o Passenger já oferece recarga Pix da Carteira, mostra QR/copia-e-cola e acompanha o status; o Core já cria a Order real e credita apenas após confirmação do processador. O que ainda falta é homologar esse fluxo no sandbox/domínio público com credenciais reais antes de produção;
   - cancelamento e reembolso já possuem fluxo autoritativo no Core: Passageiro pode cancelar após uma rodada sem motorista; Motorista pode cancelar corrida atribuída inclusive em andamento; Admin mantém cancelamento protegido; carteira é estornada internamente e Pix/cartão usam `REFUND_PENDING` até confirmação;
   - quando nenhuma oferta é aceita, o Passageiro pode tentar uma nova rodada sem nova cobrança ou cancelar e receber reembolso integral; se não decidir, o Core encerra automaticamente após o prazo operacional configurável (padrão 15 minutos) e inicia o reembolso;
   - cancelamento do Motorista durante `IN_PROGRESS` não liquida a corrida para o Motorista: o Passageiro recebe reembolso integral e a eventual compensação do Motorista fica separada para revisão administrativa;
   - solicitação de estorno integral e reconciliação da confirmação Orders já existem no Core, inclusive retry idempotente e varredura automática de `REFUND_PENDING`;
   - ainda é necessário validar pagamento/estorno no sandbox externo e domínio público; conciliação operacional completa, tratamento operacional de chargebacks/estornos parciais e repasse Pix real continuam pendentes.

5. **Assinatura Android de produção ainda não existe**
   - a auditoria removeu o fallback de release para chave debug;
   - builds sem keystore servem apenas para validação técnica e não devem ser distribuídos;
   - a keystore de produção deve ficar fora do Git e ser injetada somente na publicação.

6. **Cobertura iOS é parcial**
   - Passageiro foi validado em Simulator;
   - Motorista possui host iOS com Keychain e localização em segundo plano configurados e foi validado em Simulator pelo CI;
   - falta Apple Developer Team, assinatura de distribuição e aparelho físico para os dois apps.

7. **Google Maps Platform está integrado; configuração externa de produção ainda falta**
   - Passenger e Driver renderizam com Google Maps SDK via `google_maps_flutter`;
   - Places e Routes passam pelo Core, sem expor a chave de servidor nos apps;
   - CI/Test Stack usa mock local para não consumir APIs pagas;
   - o repositório já define cinco credenciais de produção separadas, IDs finais dos apps, validação de chave móvel no gate de release e matriz de restrições em `docs/GOOGLE_MAPS_PRODUCTION.md`;
   - ainda faltam criar/configurar as chaves reais no Google Cloud, billing/budgets/quotas, restrições efetivas, IP público do VPS, SHA-1 final da assinatura Android e validação em aparelhos físicos.

8. **Privacidade, LGPD e operação da autenticação**
   - sessão Bearer, expiração, revogação e token em Keychain/Keystore já existem; sessões expiradas/revogadas fora da retenção são limpas automaticamente;
   - código OTP fica armazenado somente como HMAC no Core, tem expiração/limite de tentativas e desafios antigos são removidos automaticamente;
   - o contrato do adapter OTP está documentado em `docs/OTP_PRODUCTION.md`; ainda faltam provider SMS real, credenciais e homologação em números/aparelhos físicos;
   - o Core aplica cooldown atômico e rate-limit persistente por telefone, dispositivo e IP, remove buckets expirados e evita revelar por resposta OTP se um cadastro de motorista existe/está suspenso; falhas transitórias de entrega reutilizam a mesma challenge/idempotency-key antes de cancelar o desafio, e o provider/edge deve manter proteção adicional contra abuso;
   - o Core já possui processo administrativo via API/CLI com chaves com expiração/revogação, escopos e auditoria, além de login humano com senha + TOTP + sessão curta conectado às operações administrativas;
   - o frontend inicial cobre login, diretórios paginados de acesso de motoristas e passageiros, indicadores de aprovação/suspensão e auditoria, e já possui stack same-origin de teste;
   - o Core e o Admin já possuem cadastro separado de perfil do motorista + veículo, com aprovação explícita e auditoria;
   - o Core já possui metadados/revisão de CNH e CRLV com histórico de versões e sem expor referência privada ao browser;
   - o Admin já consulta somente metadados sanitizados e registra a decisão humana de aprovação/rejeição, sem receber storageKey ou hash do arquivo;
   - inspeção segura já existe no Core/Admin: sessão humana obrigatória, token criptografado curto, proxy `no-store`, validação de hash/MIME/tamanho/assinatura e preview temporário; o stack E2E usa um storage privado de teste;
   - upload de CNH/CRLV no app e no Core já existe, com validação de conteúdo e status pendente; os adapters de storage HTTP privado e diretório privado também existem;
   - ainda faltam configurar storage privado persistente, permissões, backup/retenção e validar envio/revisão no ambiente final, além de concluir o onboarding operacional;
   - o Admin já cobre histórico/cancelamento seguro de viagens, bloqueios de acesso, auditoria, ledger histórico protegido e inspeção segura de documentos; ainda falta a implantação operacional e demais itens de Go-Live;
   - o Core já possui documentos legais versionados, aceite, preferências de privacidade e solicitações de acesso/correção/exclusão-anonimização/portabilidade/revogação; antes do lançamento ainda faltam conteúdo jurídico final revisado, política operacional de retenção/exclusão e validação ponta a ponta desses procedimentos em produção.

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
   - a validação específica já existe para destinos externos aprovados e para localidades locais reconhecidas via Google Places, usando `placeProof` assinada pelo Core; falta cobertura geoespacial completa para GPS puro e pontos sem classificação aprovada, além de validação física em condições reais.

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
