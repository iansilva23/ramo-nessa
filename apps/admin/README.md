# Ramo Nessa Admin

O painel web administrativo já possui uma primeira superfície funcional, sem
dependências de frontend de terceiros. O **Core administrativo** e o painel usam
autenticação humana segura:

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
O frontend autentica com a sessão humana `rn_admin_session_` e nunca
embute uma API key administrativa no bundle. As rotas operacionais já aceitam essa
sessão humana pelos mesmos escopos, mantendo a auditoria separada entre usuário e
API key.

Consulte `../../docs/ADMIN_CONTROL_PLANE.md` para o procedimento operacional.

## Primeira superfície web

A versão inicial implementa:

- login humano com e-mail + senha + TOTP;
- sessão mantida somente em memória;
- visão dos escopos e expiração da sessão;
- diretório paginado de motoristas com busca e filtro por status;
- diretório paginado somente leitura de passageiros;
- indicadores reais de total/aprovados/suspensos;
- dashboard operacional de corridas com estados reais e janela móvel de 24h;
- módulo Viagens com filtros, busca, paginação e detalhe read-only;
- catálogo ativo protegido de preços/zonas com histórico de versões;
- criação e edição de rascunhos de preços para rotas fixas e localidades;
- publicação auditada com vigência imediata ou programada;
- ativação/desativação versionada de categorias e política 4x4 ao cruzar Jeri;
- tabela de corridas ativas com rota, categoria, operador, valor e atualização;
- consulta de identidade de motorista;
- cadastro de perfil + veículo com edição e aprovação explícita no painel;
- consulta sanitizada de CNH/CRLV e revisão humana de documentos pendentes;
- nenhuma referência privada de storage ou hash documental é entregue ao navegador;
- provisionamento seguro (suspenso por padrão);
- aprovação e suspensão;
- leitura da trilha de auditoria;
- layout responsivo seguindo a identidade amarelo/preto oficial;
- CSP restritiva e ausência de `localStorage`/`sessionStorage`.

### Publicação

O painel deve ser servido em **mesma origem** que o Core por um reverse proxy
confiável. O navegador usa apenas caminhos `/v1/admin/**`, e a CSP mantém
`connect-src 'self'`. Isso evita liberar CORS administrativo de forma ampla.

O stack de teste same-origin fica em `../../deploy/test/`. Ele publica somente o
gateway, mantém o Core privado na rede Docker e encaminha `/v1/**` para o backend.

Arquivos estáticos de entrada:

```text
apps/admin/index.html
apps/admin/styles.css
apps/admin/src/
```

A próxima evolução visual/funcional inclui acesso seguro ao arquivo documental
privado, edição estrutural de zonas/localidades, pagamentos, mapa da frota,
bloqueios e demais módulos. O painel atual
registra a decisão humana, mas não substitui a inspeção do arquivo no storage
privado autorizado.
