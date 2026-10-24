# Tutorial de instalação Web — GIF de referência

O modal de **Adicionar app à Tela de Início** pertence ao **navegador**.
Em PWA instalada (standalone / navigator.standalone), o banner continua
oculto e o guia não deve aparecer. O fluxo nativo Android/iOS não muda.

A animação original do usuário foi adaptada sem alterar a sequência e
mantida com 10,58 segundos, 360 × 360, 127 quadros, em loop.

**Arquivo Web obrigatório para o tutorial no Safari:**
`ramo_install_tutorial_ios.gif` na raiz de cada bundle público Web:
- `passenger/ramo_install_tutorial_ios.gif`
- `driver/ramo_install_tutorial_ios.gif`

SHA-256 do GIF otimizado:
`a40bc26a4ebcc4691f2ea6e77909a1642d8a90d5fe80d45f294ab9a82d99b7c7`

O GIF é um recurso público (apenas demonstrações de interface).
Nunca armazenar credenciais ou outros dados privados nessa mídia.

**Atenção:** até que esse arquivo binário seja adicionado aos dois diretórios
`apps/{passenger,driver}/web/`, o build do GitHub não o empacota.
Não publicar a versão nova sem confirmar a mídia nos dois bundles; o widget
tem mensagem de contingência caso o arquivo esteja indisponível.

Teste manual no Safari do iPhone (página no navegador, não instalada):
1. Entrar e tocar no banner de instalação.
2. Confirmar três instruções, GIF animado, botão **Entendi** e fechamento.
3. Abrir o ícone instalado e verificar que nem banner nem tutorial aparecem.
4. No navegador Android, usar instruções próprias; não mostrar o GIF do Safari.
5. Confirmar que fechar o tutorial não afeta o login, mapa, GPS ou corridas.
