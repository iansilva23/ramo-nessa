# Baseline de segurança do VPS

Este checklist complementa o stack em deploy/prod. Ele não substitui uma auditoria de infraestrutura antes do Go-Live.

## Regras obrigatórias

- publicar somente 80/TCP e 443/TCP; 443/UDP é opcional para HTTP/3;
- PostgreSQL e Core permanecem sem portas públicas;
- SSH deve usar chave pública; senha e login root devem ser desativados somente depois de confirmar uma nova sessão administrativa funcional;
- manter o sistema e Docker atualizados com correções de segurança;
- sincronização de horário/NTP deve estar ativa;
- deploy/prod/.env deve permanecer 0600 e fora do Git;
- Docker group equivale a privilégio de root; limitar seus membros;
- backups devem ficar fora do repositório e com acesso restrito;
- nunca usar docker compose down -v em produção;
- não copiar Service Accounts, Access Tokens, webhook secrets, TOTP ou chaves privadas para commits/logs;
- revisar espaço em disco, uso de memória, saúde dos containers e validade do backup antes de qualquer atualização.

## Firewall

Permitir externamente apenas SSH administrativo e o tráfego web necessário. PostgreSQL 5432 e Core 8080 não devem aceitar tráfego da internet.

## Atualização segura

Antes de atualizar: criar e verificar backup, confirmar /ready, registrar o SHA da release e garantir acesso SSH alternativo. Depois da atualização: validar /health, /ready, /admin/, login e um fluxo operacional controlado.

## Segredos

O gerador de deploy/prod cria apenas segredos internos. Credenciais de Google Maps, OTP, Mercado Pago, Firebase e providers financeiros devem vir dos respectivos provedores e ser inseridas somente no host protegido.
