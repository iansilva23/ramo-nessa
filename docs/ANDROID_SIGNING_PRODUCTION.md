# Assinatura Android de produção

Este documento define o fechamento da assinatura Android do Ramo Nessa para
Passageiro e Motorista.

## Estado do código

Os dois apps possuem dois caminhos explicitamente separados:

- **Preview**: usa somente a keystore pública de teste do repositório, ativa por
  `RAMO_PREVIEW_SIGNING=true`, adiciona o sufixo `.preview` e nunca deve ser
  enviado às lojas;
- **Produção**: usa somente uma keystore privada fornecida ao build por Secrets,
  ativa por `RAMO_PRODUCTION_SIGNING=true` e mantém os application IDs finais
  `br.com.ramonessa.passenger` e `br.com.ramonessa.driver`.

Preview e produção não podem ser ativados ao mesmo tempo. O Gradle falha de forma
explícita se a assinatura de produção for solicitada sem todos os dados necessários.

## Secrets do GitHub Actions

O workflow `Mobile Build Audit` exige:

- `RAMO_ANDROID_KEYSTORE_BASE64`: conteúdo binário da keystore codificado em Base64;
- `RAMO_ANDROID_KEYSTORE_PASSWORD`: senha da keystore;
- `RAMO_ANDROID_KEY_ALIAS`: alias da upload key;
- `RAMO_ANDROID_KEY_PASSWORD`: senha da chave.

A keystore e suas senhas não devem ser colocadas em Git, arquivos de configuração
versionados, Admin, Core, Passenger ou Driver.

O workflow reconstrói a keystore somente no diretório temporário do runner,
restringe a permissão do arquivo, valida a senha e o alias com `keytool`, compila
os APKs com a assinatura de produção e valida cada APK com `apksigner` antes de
enviar o artefato.

## Criação da upload key

A upload key deve ser gerada em uma máquina controlada e guardada fora do
repositório. Exemplo:

```bash
keytool -genkeypair -v \
  -keystore ramo-nessa-upload.jks \
  -alias ramo-nessa-upload \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

Use uma senha forte e exclusiva. Faça cópia segura da keystore e das credenciais.
Perder a upload key pode exigir processo de recuperação junto à loja.

Para gerar o valor do Secret Base64 no macOS/Linux:

```bash
base64 < ramo-nessa-upload.jks | tr -d '\n'
```

Não cole esse valor em issue, commit, log, documentação ou conversa pública.

## Google Play App Signing

Antes da publicação:

1. ativar o Google Play App Signing para cada app;
2. cadastrar a upload key utilizada pelo CI;
3. confirmar os certificados SHA-1/SHA-256 exibidos pelo Play Console;
4. usar o certificado correto nas restrições Android do Google Maps;
5. manter Passenger e Driver com seus application IDs finais.

É aceitável usar a mesma upload key para os dois apps do mesmo proprietário,
desde que a chave permaneça bem protegida. Se a operação preferir isolamento
máximo, o workflow poderá ser evoluído para chaves separadas por app antes do
primeiro lançamento.

## Regra de segurança

A presença de um arquivo `app-release.apk` não prova que ele está pronto para
produção. O gate final só deve ser considerado válido quando:

- Core HTTPS, Maps e Firebase de produção estiverem configurados;
- a assinatura real tiver sido aplicada e verificada;
- os APKs tiverem sido testados em aparelhos físicos;
- os certificados finais tiverem sido registrados nas integrações dependentes;
- a versão de publicação tiver passado pela revisão operacional.

A keystore de Preview nunca é aceita como assinatura de produção.
