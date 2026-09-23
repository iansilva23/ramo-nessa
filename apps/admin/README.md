# Ramo Nessa Admin

O frontend do painel web ainda será construído, mas o **Core administrativo** já
possui plano de controle e autenticação humana segura:

- credenciais administrativas separadas das sessões de Passageiro/Motorista;
- chaves de alta entropia com somente SHA-256 persistido;
- escopos por operação;
- expiração automática e revogação de credenciais;
- provisionamento seguro com motorista suspenso por padrão, aprovação e suspensão;
- revogação imediata das sessões do motorista suspenso;
- trilha de auditoria administrativa;
- usuário humano com senha derivada por scrypt;
- MFA TOTP com segredo cifrado;
- sessão curta de 2 horas e rate-limit persistente de login.

## Regra de segurança

A chave administrativa **não deve ser embutida em JavaScript, HTML, Flutter Web ou
qualquer bundle entregue ao navegador**.

As chaves `rn_admin_` continuam destinadas a operação server-to-server/CLI.
O futuro frontend deve autenticar com a sessão humana `rn_admin_session_` e nunca
embutir uma API key administrativa no bundle.

Consulte `../../docs/ADMIN_CONTROL_PLANE.md` para o procedimento operacional.

## Escopo futuro do painel

- dashboard;
- usuários;
- motoristas e documentos;
- viagens;
- preços e zonas;
- pagamentos e comissões;
- bloqueios;
- auditoria.
