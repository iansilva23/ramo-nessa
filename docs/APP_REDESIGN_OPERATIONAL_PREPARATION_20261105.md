# Preparação operacional do redesign — 05/11/2026

Fonte dos dois aplicativos: `0d8d865af3b27db8f7ea91663e0393aeb134b817`, candidato do PR #110. O PR de empacotamento é #111. A compilação usa checkout explícito dessa fonte; o commit do workflow é registrado separadamente nos manifestos.

## Pacotes em preparação

O workflow `app-redesign-connected-package.yml` reutiliza os validadores e as configurações dos builds anteriores. São quatro jobs: Motorista e Passageiro Android/Web; Motorista e Passageiro iPhone sem assinatura. Não compila nem instala o Core ou o ADM, não cria release e não acessa a VPS para alteração.

- API de destino: `https://app.ramonessa.com.br`; `RAMO_PREVIEW_MODE=false`.
- Android: packages `br.com.ramonessa.driver.preview` e `br.com.ramonessa.passenger.preview`, com a chave estável de teste já existente.
- Certificado Android SHA-256: `21867b7cf8beb84b4c55d648e7be3aa18f0ca78a5c57d18c1557fb503cd9efc9`.
- Android SHA-1: `44:B0:F5:EE:DF:50:D0:5C:98:0C:46:FA:33:C6:76:56:DD:46:92:6E`.
- O mesmo número de build é definido uma vez para os quatro jobs. A identidade e o certificado são verificados no APK resultante.
- Web: rotas `/motorista/` e `/passageiro/`; Maps do segredo existente e Firebase público de `config/web/firebase.public.json`.
- iPhone: builds de dispositivo `--no-codesign`; exigem provisionamento e assinatura Apple antes de instalar. Não são IPAs instaláveis.
- Os quatro manifestos registram fonte, commit do workflow, número de build e hashes. Um job final verifica a consistência e a integridade de todos os pacotes.

A compatibilidade de atualização Android exige que o aparelho tenha o mesmo package e certificado. A existência da chave no repositório não comprova a identidade do APK que está instalado no aparelho. Não desinstalar o app anterior para contornar divergência.

## Evidência disponível

O código da fonte já passou em análise, testes e compilação de verificação no run `42122234160`. O empacotamento conectado é uma validação adicional, necessária por usar configuração operacional, release Android e build de dispositivo iOS. Não repetir a bateria anterior sem mudança no produto ou falha que a justifique.

Na leitura pública desta retomada, os índices e arquivos de push dos dois apps responderam HTTP 200. A configuração de push corresponde ao JSON público da fonte. A igualdade da chave Maps Web entre as duas rotas foi conferida por hash. Os `main.dart.js` públicos também correspondem aos manifestos dos ZIPs da release `recovery-web-9e913c89de37`, fonte `9e913c89de373945cb99b3b3150feb9c012d2983`. Os ZIPs dessa referência foram conferidos pelos SHA-256 já registrados no instalador anterior. Motorista: `fe9f17ddaf09619c5e71d201392531ed619d3736e27b49b6d04c4ebdd3e2bb41`; Passageiro: `04cb6572e689411cecc5f43fef0bec3bafc181be89ac17a1345fb09b36b376cb`. Esta leitura não identifica imagem Docker, mounts, âncora de retorno, permissões reais de provedores ou funcionamento em aparelho.

## Inventário ativo antes de montar a troca

`deploy/app-redesign/inspect-active.py` usa apenas `docker ps`, `docker inspect` e leitura de arquivos locais. Imprime identificadores de containers/imagens, mounts, caminhos Compose e hashes de configuração e dos bundles. Não imprime valores de ambiente, conteúdo Compose, dados de clientes ou chaves. Não reinicia ou altera serviços, banco, arquivos ou provedores.

Executar o script na VPS com acesso de leitura ao Docker e aos arquivos ativos, usando uma revisão e checksum conferidos. O inventário exige o projeto Compose `ramo-nessa-staging`, Core/gateway presentes e mount bind `/srv/web` somente leitura. Configuração diferente, links inesperados ou mudança de containers/configuração durante a leitura interrompem o inventário. Não remover essas verificações para aceitar um estado desconhecido.

Run do inventário `42138226949` aprovado no GitHub. Quatro testes isolados verificam ausência de valores privados na saída, recusa de links, detecção de mudança concorrente e mensagens de falha sem detalhes privados. Não executam Docker nem acessam a VPS.

A saída `APP_REDESIGN_READ_ONLY_INVENTORY` e `baselineSha256` são evidência de leitura, não uma âncora já criada. Ainda será necessário comparar os pacotes Web contra o shell/configuração ativa, preparar retorno a partir da versão identificada e conferir todos os arquivos fora dos dois apps antes de aplicar a atualização autorizada. Nenhum instalador histórico deve ser executado preventivamente.

## Comando de leitura na VPS

O script abaixo está fixado no commit em que os quatro testes do inventário passaram. Não instala a atualização; apenas identifica a base que precisará ser preservada.

```bash
bash <<'CONFERIR_BASE_REDESIGN'
set -euo pipefail
sudo -v
preparo=$(mktemp -d /tmp/ramo-redesign-leitura.XXXXXX)
curl -fLsS --retry 2 --max-time 45 \
  'https://raw.githubusercontent.com/iansilva23/ramo-nessa/66fda3e0172536758fa3f841e38a4721a691feb7/deploy/app-redesign/inspect-active.py' \
  -o "$preparo/inspecionar.py"
printf '%s  %s\n' \
  cb995c91b4cda7f17c94940ae45f4b0284a0374b6613625d2f49fcb186cd5b55 \
  "$preparo/inspecionar.py" | sha256sum -c -
sudo python3 "$preparo/inspecionar.py"
CONFERIR_BASE_REDESIGN
```

## Retomada do empacotamento Android

O primeiro run `42137858046` compilou Android e Web nos dois apps e concluiu os dois iPhone. A etapa que interpreta o relatório do apksigner não reconheceu o certificado Android esperado e interrompeu a liberação dos pacotes Android. A saída posterior confirmou a causa: a ferramenta usa o prefixo `V2 Signer: certificate`, enquanto o primeiro parser exigia `Signer #1 certificate`. A conferência atual ignora esse prefixo variável e continua exigindo o hash exato do certificado da chave estável. Os dois APKs passaram nessa comparação, com o mesmo certificado original. A falha do primeiro run foi de interpretação do relatório, sem mudança de assinatura ou do produto.

O run de retomada `42139267939` preserva a exigência do hash exato da chave estável e acrescenta diagnóstico público e preservação dos candidatos não verificados. Aceita variação de prefixo e espaçamento do relatório do apksigner. Os builds iPhone aprovados são reutilizados do run inicial após conferir fonte, build e todos os hashes. O número de build dos quatro pacotes continua `1793925295`. Artefatos `unverified-*` não estão liberados para instalação.

## Resultado confirmado da preparação

Run final `42139267939` aprovado em todos os jobs, incluindo a conferência conjunta dos quatro pacotes. Os iPhone já aprovados foram reaproveitados, com fonte e hashes reconferidos. Os dois Android foram compilados e verificados; os bundles Web passaram nos validadores de rota, bootstrap, ícones, Maps e push.

Os arquivos dos dois artefatos Android/Web foram baixados e conferidos localmente, incluindo os hashes de cada arquivo interno dos bundles Web. Maps e push Web correspondem à configuração pública ativa lida nesta retomada. O ZIP do relatório agregado também foi baixado e conferido: SHA-256 `cb64ce78dc858165a9b7199a962c422096db10e61e839904d1d69f9de56418d3`.

Fonte do produto `0d8d865af3b27db8f7ea91663e0393aeb134b817`; build coordenado `1793925295`; workflow de retomada `706f6bfa38bf017cb7aa8850edef921bdaf77a04`.

| Arquivo | SHA-256 |
| --- | --- |
| `RamoNessa-Motorista-Redesign-Android.apk` | `fe087a34cf9ec398cb595d7e7157c7f15888c837bf2784afeffa945df1563cff` |
| `RamoNessa-Motorista-Redesign-Web.zip` | `3a8c7ca391ca1f22deaa1e1be87bcc10313b886bb8fcbc8cdb7c93eec28cf928` |
| `RamoNessa-Motorista-Redesign-iPhone-SEM-ASSINATURA.zip` | `22a94491c6dae3c037c89ccb106df3313ef60fa9720f13905b659a52233f5f82` |
| `RamoNessa-Passageiro-Redesign-Android.apk` | `0de45939cf4bd5dca5c634fc865f51d16cb21c47bad9fe58f85d892580fabb99` |
| `RamoNessa-Passageiro-Redesign-Web.zip` | `c073afbaa6b0c5a63eca298123dbe134d63e809f17a364fb315e2000d81bfb5a` |
| `RamoNessa-Passageiro-Redesign-iPhone-SEM-ASSINATURA.zip` | `60be7fe7f03651084b912b1103debd520bbc7d8d3d9efaf88e3a7ecd1f1d8ca5` |

Artefatos verificados do run final: `redesign-driver-android` (`13467177465`), `redesign-passenger-android` (`13467041574`), `redesign-driver-ios` (`13468215228`), `redesign-passenger-ios` (`13468200273`) e `redesign-package-report` (`13468316118`). Os artefatos `unverified-*` são checkpoints de diagnóstico, não os pacotes finais.

A conclusão é de empacotamento e conferência. Não houve acesso SSH, instalação na VPS ou teste de atualização em aparelho. Antes de preparar a instalação, obter a saída do inventário de leitura acima. Os builds Apple continuam sem assinatura e os APKs continuam com a assinatura de teste estável, sem certificação para lojas.

## Limites e continuidade

Sem merge, deploy, publicação nas lojas ou mudanças no ADM/backend nesta fase. O empacotamento conectado e os hashes foram aprovados nesta preparação. Continuam pendentes o inventário real da VPS, a preparação da âncora, a instalação coordenada, o teste de atualização Android e a homologação física. A segunda atualização funcional/legal permanece no escopo já registrado no prompt mestre.
