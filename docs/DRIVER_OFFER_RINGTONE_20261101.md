# Toque de nova corrida — implementação isolada

## Escopo

O app Motorista usa um áudio personalizado enquanto existe uma oferta de corrida válida. O player foi conectado ao fluxo de ofertas já existente sem alterar matching, preço, pagamento, prazo de oferta ou visual.

- Inicia quando uma nova oferta válida chega por tempo real ou polling.
- Repete até aceite, recusa, retirada da oferta, offline ou prazo expirado.
- Ofertas de mesmo ID não reiniciam o som a cada polling.
- Em erro ao aceitar/recusar, retoma o áudio apenas se a oferta permanecer válida.
- Ao encerrar a tela, interrompe a reprodução e libera o player.

## Arquivo instalado na branch

`apps/driver/assets/audio/nova_corrida.mp3`

**O áudio da branch é uma versão de ~2,09 s, recortada da gravação original de 63,4 s enviada pelo responsável e recomprimida para 24 kbps mono; a melodia permanece igual.** É um ciclo curto para repetição. Não é o mesmo arquivo binário de 63 s.

SHA-256 do áudio compacto: `715ddb02d47699c91d48820d6ee8eb3fd1eb860d2517e54acd731609ead6bb25`

O `pubspec.yaml` declara o asset e a dependência `audioplayers`.

## Pendências obrigatórias antes de merge/deploy

1. `apps/driver/pubspec.lock` precisa ser regenerado com `flutter pub get` para registrar `audioplayers` e suas dependências. A versão atual ainda não contém esse pacote.
2. Executar `flutter analyze`, `flutter test`, build Web, Android e iOS (simulador e aparelhos reais onde possível).
3. Testar chegada, aceite, recusa, expiração, cancelamento remoto e offline, incluindo múltiplas ofertas sequenciais e condições de corrida/reconexão.
4. Validar Web/PWA com as políticas de autoplay e notificações em segundo plano. Não presumir áudio com o aplicativo fechado ou em background.
5. Confirmar que a versão ativa na VPS corresponde à árvore deste PR; a branch não está implantada.
6. Comparar a qualidade da versão compacta com a gravação original antes da aprovação final.

**Status:** áudio commitado e verificado no GitHub, PR de rascunho, sem merge, sem testes reais e sem deploy.
