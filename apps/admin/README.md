# Ramo Nessa Admin

O painel web ainda será construído, mas o **plano de controle administrativo do Core**
já possui uma base segura para operação de motoristas:

- credenciais administrativas separadas das sessões de Passageiro/Motorista;
- chaves de alta entropia com somente SHA-256 persistido;
- escopos por operação;
- expiração automática e revogação de credenciais;
- provisionamento seguro com motorista suspenso por padrão, aprovação e suspensão;
- revogação imediata das sessões do motorista suspenso;
- trilha de auditoria administrativa.

## Regra de segurança

A chave administrativa **não deve ser embutida em JavaScript, HTML, Flutter Web ou
qualquer bundle entregue ao navegador**.

Enquanto não existir login humano do Admin com sessão própria, os endpoints
administrativos são destinados a operação server-to-server/CLI por pessoal
autorizado.

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
