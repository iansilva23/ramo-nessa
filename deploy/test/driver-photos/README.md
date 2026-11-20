# Homologação das cinco fotos do Motorista

Use as duas versões geradas na mesma execução de **Driver photo verification** no GitHub. Baixe `ramo-photo-web-preview` e `ramo-photo-android-preview`. O ambiente usa um banco exclusivo, fotos de teste e uma porta acessível apenas neste computador.

1. Com Docker Compose v2.24.4 ou posterior, extraia os arquivos web para `apps/driver/build/web`. Se usar outra pasta, defina `PHOTO_WEB_DIRECTORY` com o caminho absoluto em todos os comandos do ambiente.
2. Na raiz deste checkout, execute `node deploy/test/driver-photos/stack.mjs up`.
3. Abra [Motorista Web](http://127.0.0.1:18765/motorista/) e crie um cadastro fictício. Use fotos e dados de teste. Crie o acesso do ADM com `node deploy/test/driver-photos/stack.mjs admin` e abra o [ADM](http://127.0.0.1:18765/administrodo/). Cadastre o segredo TOTP exibido em um autenticador.
4. Para testar no Android, conecte o celular por USB com a depuração USB ativa. Rode `adb reverse tcp:18765 tcp:18765` e `adb install -r /caminho/do/app-debug.apk`. O APK de homologação tem o identificador `br.com.ramonessa.driver.phototest`.
5. Tire uma foto pela câmera e escolha as demais pela galeria. Confira a prévia, feche e abra o aplicativo para validar o rascunho, envie as cinco fotos e revise no ADM. Reprove uma foto com motivo e confira o reenvio só daquele item no Motorista.
6. Execute `node deploy/test/driver-photos/stack.mjs down` para encerrar preservando o banco de teste.

No GitHub, a homologação automática cria um cadastro fictício pela API, revisa as fotos e restaura o banco de teste numa base temporária. Depois compara cada imagem restaurada com o SHA-256 registrado no banco. A etapa de câmera e galeria deve ser feita no aparelho.
