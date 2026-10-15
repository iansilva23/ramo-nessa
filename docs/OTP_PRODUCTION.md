# OTP/SMS — produção

Este documento define o contrato de entrega OTP do Ramo Nessa. O Core não fica acoplado a um fornecedor específico de SMS; em produção ele chama um endpoint HTTPS adaptador.

## Estado da autenticação

- código numérico de 6 dígitos;
- validade de 5 minutos;
- cooldown de 60 segundos entre desafios ativos;
- no máximo 5 tentativas de verificação por challenge;
- rate-limit persistente por telefone, instância do app e IP;
- código armazenado no Core somente como HMAC, nunca em texto puro;
- provider de desenvolvimento proibido quando NODE_ENV=production.

## Contrato do webhook

Produção exige:

- OTP_PROVIDER=webhook;
- OTP_WEBHOOK_URL em HTTPS;
- OTP_WEBHOOK_TOKEN com segredo forte;
- Authorization: Bearer <token>;
- x-ramo-nessa-webhook-version: 1;
- idempotency-key igual ao challengeId.

O POST envia JSON no formato:

    {
      "phoneE164": "+5588999991234",
      "code": "123456",
      "challengeId": "uuid",
      "expiresInSeconds": 300
    }

Qualquer HTTP 2xx significa que o adaptador aceitou o envio. O adaptador deve responder rapidamente após aceitar/enfileirar a mensagem, sem esperar a confirmação final da operadora.

## Idempotência obrigatória

O adaptador deve tratar challengeId/idempotency-key como único. Receber novamente a mesma chave NÃO pode gerar outro SMS independente.

O Core faz até 3 tentativas usando exatamente a mesma challengeId, código, corpo e idempotency-key quando ocorre:

- falha de rede/timeout;
- HTTP 408;
- HTTP 425;
- HTTP 429;
- HTTP 5xx.

Cada tentativa tem timeout de 2,5 segundos e usa backoff curto. O pior caso continua em aproximadamente 8 segundos.

HTTP 4xx definitivo, fora 408/425/429, não é repetido.

Se a entrega falhar após as tentativas, o Core cancela a challenge. O código deixa de ser válido e um novo pedido pode criar outra challenge sem esperar o cooldown anterior.

## Privacidade e logs

O adaptador precisa do código em texto para compor o SMS, mas não deve persistir nem registrar em logs:

- código OTP;
- Authorization Bearer token;
- corpo completo do request;
- telefone junto com código em logs de erro.

Logs operacionais devem usar identificadores técnicos/redigidos e status do fornecedor.

## Conteúdo recomendado do SMS

Texto curto sugerido:

    Seu código Ramo Nessa é 123456. Ele expira em 5 minutos. Não compartilhe este código.

O adaptador pode adequar o texto ao fornecedor sem alterar a semântica de expiração.

## Homologação externa obrigatória

Antes do lançamento:

1. escolher/configurar o fornecedor de SMS ou adaptador;
2. guardar credenciais somente no endpoint/adaptador e no host protegido;
3. testar números brasileiros reais de operadoras diferentes;
4. testar timeout, 429 e 5xx confirmando idempotência;
5. confirmar que o mesmo challengeId não envia SMS duplicado;
6. medir latência e taxa de entrega;
7. testar reenvio após falha;
8. validar login Passenger e Driver em aparelhos físicos;
9. configurar alertas de falha/custo no fornecedor.

## Estado

O Core e o contrato de integração estão preparados. A prontidão comercial deste passo depende de um provider/adaptador real, credenciais, homologação de entrega e testes em aparelhos físicos.

## WhatsApp com entrar.api.br

`OTP_PROVIDER=entrar-whatsapp` seleciona emissão e validação externas. Configure
`ENTRAR_API_SECRET` exclusivamente no Core. Contrato público:
https://entrar.api.br/otp-whatsapp (consultado em 02/10/2026).

O Core envia somente `{telefone}` para `https://cpf.entrar.api.br/api/otp/send`,
guarda o `otpId` no PostgreSQL e devolve ao app apenas o challengeId local.
O código é gerado pelo provedor; `{otpId,codigo}` é enviado a `/api/otp/verify`.
Somente `ok === true` e `verified === true` autorizam uma sessão.

Mantemos validade local de 5 minutos (o provedor anuncia 10), 5 tentativas,
cooldown de 60 segundos e limites por telefone/dispositivo/IP. A verificação
reserva uma tentativa atomicamente por 15 segundos, sem segurar transação durante
HTTP. Somente o dono dessa reserva pode consumir o desafio e emitir uma sessão.
Falhas, respostas atrasadas, reenvios e validação local por digest não autorizam
login externo. Não há retry automático nem fallback pago: envio pode já ter sido
cobrado e verificação pode já ter consumido o código no provedor.

Homologação usa `OTP_PROVIDER=entrar-whatsapp` e
`ENTRAR_API_SECRET_HOST_FILE=/home/ubuntu/.config/ramo-nessa/staging/entrar-api-secret`.
O helper exige arquivo regular privado (0600), rejeita symlinks e injeta o segredo
somente no Core. Nunca enviar a chave em chat, versionar ou incluí-la em APKs.
O painel Admin informa configuração, não comprova entrega. Depois da ativação,
homologar solicitação e verificação em um aparelho com WhatsApp. APKs Preview usam
autenticação demonstrativa: esse teste exige build conectado ao Core real.
