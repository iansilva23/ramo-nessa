# Acesso por senha e retirada da autenticação por WhatsApp

Decisão posterior de Ian: retirar completamente o mecanismo de autenticação WhatsApp e a recuperação de senha dos dois perfis. O motorista usa o mesmo fluxo visual do passageiro, com os textos de parceiro aprovados. Esta revisão substitui a entrega anterior e seus instaladores.

## Resultado no código

Os dois apps renderizam `RamoPasswordAccessFlow`: apresentação, entrar e cadastro. Passageiro entra com e-mail/senha; motorista com usuário ou e-mail/senha. O botão do motorista diz **Seja um motorista parceiro** e o cadastro **Comece sua jornada como parceiro**. Não há etapas de código, recuperação, tela antiga de telefone ou desvio para outro formulário. O número de WhatsApp permanece como contato para a operação das corridas, sem alegar confirmação de propriedade.

O novo cadastro faz INSERT de uma identidade nova e suas credenciais; nunca associa a senha a uma conta existente pelo telefone. Colisões de telefone, e-mail e usuário são recusadas. No PostgreSQL, a identidade e a credencial de motorista são gravadas na mesma transação. Motoristas novos continuam com `driver_registration_only=true`; aprovação, CPF, documentação, veículo e permissões profissionais continuam nas etapas existentes. Quem já tem conta usa a senha existente; usuários antigos sem senha só podem configurar acesso a partir de sua sessão já autenticada. Não há recuperação alternativa nesta revisão.

Foram retirados serviço/provedor de envio, verificação, challenges, tentativas/cooldown específicos, rotas e tipos de recuperação, interfaces e telas antigas, controles e credenciais nas configurações atuais e cartão OTP no ADM. Os repositórios foram separados como `auth-identity-repository`; identidades, sessões e limites de senha continuam necessários. O navegador serializa emissão/revogação de cookies para os endpoints de login e cadastro dos dois perfis.

A migration 102 elimina as tabelas de challenges/solicitações de recuperação e renomeia a tabela compartilhada de limites para `auth_password_rate_limits`. **Ela não apaga contas, senhas, sessões, corridas ou financeiro.** As migrations históricas continuam imutáveis para preservar checksums e permitir reconstrução do banco; seus nomes/referências antigos não representam uma implementação ativa. TOTP do ADM e código de embarque são mecanismos separados e permanecem.

A configuração atual passa a usar `AUTH_PASSWORD_RATE_LIMIT_SECRET` para proteger os limites de senha. Não se deve substituir o ambiente de produção pelo exemplo nem executar instaladores antigos. O build limpa `dist` antes de compilar, para que módulos removidos não reapareçam nos pacotes.

## Publicação

O workflow testa o backend e PostgreSQL, analisa/testa ambos os apps e compila Android, Web e iPhone. APKs mantêm a assinatura de teste já usada; iPhone segue sem assinatura Apple. Os pacotes não comprovam instalação na VPS. Esta revisão exige nova aplicação compatível que preserve os patches atuais de corrida, bloqueio de tela, gateway e shell Web. Não usar os pacotes/instaladores anteriores de OTP ou de login parcial.
