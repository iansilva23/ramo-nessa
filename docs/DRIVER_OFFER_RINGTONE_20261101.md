# Toque de nova corrida — implantação pendente

## Regras
- Iniciar somente quando uma oferta válida for recebida pelo Motorista.
- Repetir o MP3 original até aceite, recusa, retirada da oferta, offline ou expiração do prazo.
- Nunca alterar regras de matching, pagamento ou duração das ofertas.
- O player usa o mesmo id da oferta, impedindo reinício a cada polling.

## Asset obrigatório que AINDA NÃO está neste branch
Salvar o MP3 original enviado pelo responsável exatamente neste caminho:
`apps/driver/assets/audio/nova_corrida.mp3`

O `pubspec.yaml` já aponta para esse caminho (Flutter assets) e usa `audioplayers`.

**Não mesclar ou implantar enquanto faltar esse arquivo.**

## Verificações pendentes
- `flutter pub get`, `flutter analyze`, `flutter test` dentro de `apps/driver`.
- Testar chegada, aceite, recusa, expiração, cancelamento remoto e offline.
- Testar corrida posterior para garantir que o áudio reinicia somente para um novo id.
- Testar Android, iOS e Web/PWA em aparelhos reais. Navegadores podem impedir reprodução automática antes de uma interação do usuário.
- Verificar comportamento ao minimizar o app e notificações em segundo plano (não presumir que o player da tela reproduz em background).
- Confirmar paridade com o pacote realmente servido pela VPS antes de qualquer deploy.

## Status
PR de rascunho, sem merge, sem deploy e sem testes de dispositivo.
