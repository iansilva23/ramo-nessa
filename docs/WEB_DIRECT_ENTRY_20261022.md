# Abertura direta dos aplicativos Web

Por decisão do proprietário, a tela de deslizar foi removida por completo do
Passageiro e Motorista Web. Os arquivos JavaScript/CSS e seus imports deixam
de existir. Não há chave de ativação, página ou configuração nova no ADM,
endpoint, armazenamento de preferência ou migration para esse recurso.

A tentativa anterior de criar uma opção no ADM foi descartada antes da
implantação; nenhuma alteração daquela tentativa foi aplicada na VPS.

O aplicativo instalado abre diretamente, inclusive ao voltar do segundo plano.
Login, sessão, GPS, notificações, Maps, busca Google, preços e pagamentos seguem
o fluxo aprovado. Android e iOS nativos não recebem builds nesta etapa.

O teste reutiliza o par Web Google aprovado (731d524d), remove somente os dois
imports e os dois arquivos da tela por aplicativo e confere que main.dart.js
permanece idêntico. Testes Chromium/WebKit exercitam abertura instalada, retorno,
primeiro controle de login, cookie seguro, recuperação da sessão e logout.
O validador do bundle recusa imports ou arquivos remanescentes da tela removida.

O código fica no PR DRAFT 37, sem merge ou alteração da VPS pelo desenvolvimento.
A publicação deve preservar os bundles anteriores para retorno e não atualizar
Core/ADM/banco. O aceite no iPhone real ainda é necessário depois de instalar.
