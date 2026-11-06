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

Na leitura pública desta retomada, os índices e arquivos de push dos dois apps responderam HTTP 200. A configuração de push corresponde ao JSON público da fonte. A igualdade da chave Maps Web entre as duas rotas foi conferida por hash. Esta leitura não identifica imagem Docker, mounts, âncora de retorno, permissões reais de provedores ou funcionamento em aparelho.

## Inventário ativo antes de montar a troca

`deploy/app-redesign/inspect-active.py` usa apenas `docker ps`, `docker inspect` e leitura de arquivos locais. Imprime identificadores de containers/imagens, mounts, caminhos Compose e hashes de configuração e dos bundles. Não imprime valores de ambiente, conteúdo Compose, dados de clientes ou chaves. Não reinicia ou altera serviços, banco, arquivos ou provedores.

Executar o script na VPS com acesso de leitura ao Docker e aos arquivos ativos, usando uma revisão e checksum conferidos. O inventário exige o projeto Compose `ramo-nessa-staging`, Core/gateway presentes e mount bind `/srv/web` somente leitura. Configuração diferente, links inesperados ou mudança de containers/configuração durante a leitura interrompem o inventário. Não remover essas verificações para aceitar um estado desconhecido.

Quatro testes isolados verificam ausência de valores privados na saída, recusa de links, detecção de mudança concorrente e mensagens de falha sem detalhes privados. Não executam Docker nem acessam a VPS.

A saída `APP_REDESIGN_READ_ONLY_INVENTORY` e `baselineSha256` são evidência de leitura, não uma âncora já criada. Ainda será necessário comparar os pacotes Web contra o shell/configuração ativa, preparar retorno a partir da versão identificada e conferir todos os arquivos fora dos dois apps antes de aplicar a atualização autorizada. Nenhum instalador histórico deve ser executado preventivamente.

## Limites e continuidade

Sem merge, deploy, publicação nas lojas ou mudanças no ADM/backend nesta fase. Builds e hashes só podem ser marcados como aprovados depois de terminar o run conectado. Continuam pendentes o inventário real da VPS, a preparação da âncora, a instalação coordenada, o teste de atualização Android e a homologação física. A segunda atualização funcional/legal permanece no escopo já registrado no prompt mestre.
