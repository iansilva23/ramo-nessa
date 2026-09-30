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
   - o baseline operacional já inclui rotação de logs Docker, hardening do Core/migrations, backup consistente de PostgreSQL + documentos privados com SHA-256, verificação sem restore, restore drill isolado e health check HTTPS;
   - o restore drill restaura banco e documentos somente em recursos Docker efêmeros, sem rede e sem reutilizar volumes de produção; ainda falta executá-lo com snapshot real do VPS e registrar o exercício;
   - a retenção local de backups agora possui dry-run por padrão, mínimo conservador de snapshots e só remove diretórios completos com manifesto reconhecido; ainda faltam validar essa política com snapshots reais do VPS e configurar/testar a cópia off-site;
   - ainda faltam executar/validar a operação no VPS real e configurar alertas/APM externos.

2. **Fluxo Passageiro ↔ Motorista já usa sessão real, mas precisa validação operacional**
   - Passageiro e Motorista suportam login OTP, sessão Bearer, restauração segura e logout com revogação;
   - headers `x-dev-*` permanecem apenas como fallback explícito fora de produção;
   - motorista não é criado automaticamente: precisa ser provisionado/aprovado antes do OTP;
   - antes do beta público, validar login, corrida e realtime em dois aparelhos físicos.

3. **Preço v1 existe, mas a operação ainda precisa de infraestrutura**
   - o Core já contém a regra comercial;
   - o Passageiro consulta o Core quando `RAMO_CORE_BASE_URL` está configurado;
   - o Admin já possui catálogo ativo protegido, rascunhos editáveis, versionamento persistente, publicação auditada, vigência imediata/programada e edição estrutural versionada das zonas/localidades suportadas;
   - destinos externos aprovados e localidades locais reconhecidas via Google Places recebem prova assinada pelo Core, vinculada à localidade e coordenadas; o catálogo versionado agora também possui geofences de localidade criadas visualmente no ADM por alfinete + raio, e o Core classifica GPS puro/coordenadas por essas áreas publicadas e emite `placeProof` assinada; cada localidade de Preá/Jijoca também possui regras versionadas de categorias permitidas e, no Preá, aplicação do adicional noturno, com o Passenger ocultando serviços desativados em corridas locais; preço, regras e área ficam preservados no mesmo rascunho e só passam a valer quando a versão é publicada; ainda é necessário calibrar e validar essas áreas com GPS real antes do Go-Live;
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
   - refunds parciais de corrida agora são reconciliados estruturalmente a partir de `transactions.refunds[]` da Orders API: cada ajuste possui ID externo idempotente, valor confirmado pelo processador, lançamento no escrow ainda disponível e fila de revisão para a parcela que já não pode ser revertida do escrow; um refund total posterior contabiliza somente o saldo ainda não devolvido;
   - chargebacks agora são reconhecidos e persistidos idempotentemente como ajustes externos, aparecem no Financeiro com valor/status/referência e ficam em revisão sem debitar automaticamente o saldo do motorista; a política final de eventual responsabilização/recuperação do motorista continua sendo uma decisão operacional separada;
   - valores de ajustes externos que exigem revisão ficam excluídos do saldo disponível para repasse da empresa até reconciliação operacional;
   - o repasse Pix de motoristas agora possui adaptador nativo para Mercado Pago Payouts: criação em /v1/payouts, idempotência, consulta de status, mapeamento de chave Pix, reconciliação pelo Core e assinatura Ed25519 obrigatória em produção; as regras de repasse normal seg/qua/sex às 07h, antecipação mínima de R$ 80 com taxa de R$ 10, aprovação exclusiva do proprietário e modo manual em lote também estão implementadas;
   - o Financeiro também possui repasse manual do saldo disponível da empresa para uma chave Pix vinculada pelo proprietário: o Core separa o fluxo dos saques de motoristas, reserva o valor no ledger antes do envio, reconcilia pelo mesmo provedor Payouts, devolve a reserva em falha/cancelamento e exclui do saldo sacável a comissão de corridas em dinheiro ainda não recuperada e os ajustes externos em revisão; a tela deixa claro que esse saldo é receita disponível da plataforma e não lucro contábil líquido de impostos/despesas;
   - ainda é necessário validar pagamento/estorno/contestação no sandbox e domínio público com credenciais reais; para Payouts faltam habilitação do produto na conta/aplicação, credenciais específicas de teste/produção, cadastro da chave pública Ed25519 com o Mercado Pago, confirmação de limites/tarifas e homologação de Pix externos reais controlados para motorista e empresa; para chargebacks ainda faltam homologar notificações/casos reais, fluxo externo de evidências e definir uma política operacional caso no futuro se deseje recuperar algum valor do motorista.

5. **Assinatura Android de produção está preparada no código, mas ainda depende da chave real**
   - a auditoria removeu o fallback de release para chave debug;
   - Passenger e Driver possuem caminho de assinatura de produção separado do Preview, sem armazenar keystore ou senhas no Git;
   - o `Mobile Build Audit` exige a keystore via Secrets, valida senha/alias e verifica os APKs com `apksigner` antes de publicar os artefatos;
   - ainda faltam gerar/proteger a upload key real, configurar os Secrets, registrar os certificados no Google Play/integrações e validar os APKs assinados em aparelhos físicos;
   - detalhes operacionais: `docs/ANDROID_SIGNING_PRODUCTION.md`.

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
   - o perfil `deploy/prod` já possui storage privado persistente para CNH/CRLV, raiz `0700`, arquivos `0600`, probe de escrita/leitura antes do Core iniciar e backup com SHA-256; o modelo está documentado em `docs/DRIVER_DOCUMENT_STORAGE_PRODUCTION.md`; ainda faltam validar upload/revisão/backup/restore no VPS real, aprovar a política formal de retenção/exclusão e concluir o onboarding operacional;
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
   - disponibilidade global de categorias, exigência 4x4 ao cruzar Jeri e disponibilidade por localidade (Moto/Entrega/Carro/Comfort no Preá, além do adicional noturno local) são políticas versionadas e publicáveis pelo Admin;
   - cada corrida congela sua exigência 4x4 para não mudar com versões futuras;
   - a validação geográfica estrutural cobre destinos externos aprovados, localidades reconhecidas via Google Places e GPS puro/pontos de mapa classificados por geofences versionadas de alfinete + raio; o Core é a autoridade, escolhe a área publicada aplicável e emite `placeProof` assinada vinculada à coordenada; pontos fora das áreas publicadas falham fechados. Ainda faltam calibração operacional dos raios e validação física em condições reais de GPS antes do Go-Live.

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
