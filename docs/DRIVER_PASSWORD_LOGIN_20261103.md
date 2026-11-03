# Motorista: usuário ou e-mail e senha

O login cotidiano do motorista agora aceita o usuário escolhido ou o e-mail, com a mesma senha. Não solicita WhatsApp nesse fluxo. A recuperação continua usando o WhatsApp já vinculado à identidade; uma troca de senha válida revoga as sessões anteriores. A segurança de senha reutiliza as funções e a política existentes do passageiro.

Motoristas conectados configuram as credenciais em **Perfil → Segurança → Usuário e senha**, sem precisar de novo OTP. Primeiro acesso sem sessão e sem senha exige a confirmação de propriedade do WhatsApp. Não há senha padrão nem configuração de credenciais com telefone não verificado. A falha de entrega da Entrar permanece sem diagnóstico definitivo; o novo login evita a dependência diária depois do cadastro seguro.

## Implementação

- Migration aditiva `101_driver_password_login.sql`: credenciais e solicitações de recuperação, ligadas à identidade existente.
- `driver-password-auth-service.ts`, `driver-password-auth-store.ts` e `driver-password-auth-routes.ts`: cadastro autenticado, aliases normalizados e únicos, login, OTP vinculado à conta/versão e recuperação transacional.
- Reutiliza scrypt, política de senha, sessões e cookies HttpOnly/Secure/SameSite do passageiro. Limites próprios do motorista agregam usuário e e-mail pela identidade; continuam ativos quando os controles extras do WhatsApp estão desativados.
- Preserva a separação passageiro/motorista, suspensão e aprovação operacional pelo ADM. Cadastro não sobrescreve credenciais existentes.
- Flutter: tela de login, recuperação e configuração, HTTP e integração com o gate e o menu de segurança. Base visual aprovada `5fa387e563074522a68adf3b3df9e7e18a4d0be6` preservada.

Endpoints: `POST /v1/auth/driver/password/login`, `POST /v1/auth/driver/password/reset/request`, `POST /v1/auth/driver/password/reset/complete` e `GET/POST /v1/driver/me/login-credentials`.

## Validação do artefato

Fonte apps/API: `fbadbe433fb5a00ae073e3e1e5abbd87de546913`. [Execução completa](https://github.com/iansilva23/ramo-nessa/actions/runs/41584479619): 934 testes Core passaram, 29 ignorados pelas condições próprias da suíte; novo teste PostgreSQL executado. Análise Flutter sem problemas, 183 testes passaram; Android, Web e iPhone compilaram. iPhone está sem assinatura Apple; Android mantém a assinatura de teste estável anterior e API real.

Instalador: `60b913fe7ea202cb554011c4dac49a802c216580`. [Ensaio](https://github.com/iansilva23/ramo-nessa/actions/runs/41585877682): 12 contratos e 14 testes na imagem sobreposta com PostgreSQL descartável, HTTP, cookies e reinício. Sem banco de produção ou envio real de WhatsApp. Migration 101 aplicada e repetida com idempotência no ensaio.

## Publicação reversível

[Pacotes apps/API](https://github.com/iansilva23/ramo-nessa/releases/tag/driver-password-fbadbe433fb5) e [instalador testado](https://github.com/iansilva23/ramo-nessa/releases/tag/driver-password-installer-60b913fe7ea2). A publicação na VPS **não está confirmada** por este desenvolvimento; exige execução do pacote na instalação compatível e análise da saída.

`deploy/driver-password/activate.py` exige a linhagem da API ativa revisada e a âncora anterior, valida ambiente/configuração/volumes e modifica a fiação compilada por âncoras reversíveis. Não troca todo o servidor por um build fonte. Testa a imagem exata antes de aplicar só a migration 101; não executa o histórico inteiro em produção. Preserva shell Web ativo, áudio, push e Maps, além dos arquivos não Motorista. Apenas Core e gateway são recriados; recusa corridas/buscas/pagamentos ativos. Falha na troca inicia retorno do gateway antes do Core; preserva tabelas aditivas e não restaura banco antigo. Mudança concorrente interrompe a recuperação para revisão.

O sucesso precisa informar `DRIVER_PASSWORD_LOGIN_ACTIVATED`. A saída fornece a âncora e os comandos de retorno e de reativação dos controles extras de WhatsApp. `otp_controls.py enabled ANCORA` reativa apenas esses controles nos dois perfis, mantendo a segurança de senha; `disabled` desativa novamente. Usar a âncora real, sem instaladores históricos.

Instalador ZIP SHA-256: `f39cc3c92e52f15a03571a391cefaf4fe75e4f80f8400143789dfd4997555c27`.
APK SHA-256: `2b486b2b6c8be803593f388727cd1f17efc57fe8782b3f08eca96b076451a47d`.

Instalação/uso em aparelho físico, GPS, cartões e bloqueio de tela ainda precisam de validação real. Atualizar a VPS antes de usar o novo APK; manter a sessão atual e configurar as credenciais antes de fazer logout.
