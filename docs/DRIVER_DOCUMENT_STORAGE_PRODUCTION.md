# Storage privado de CNH/CRLV — produção

O Ramo Nessa usa storage privado para documentos de motorista. No lançamento inicial, o perfil `deploy/prod` usa um volume Docker persistente local ao VPS, acessível somente pelo Core.

## Arquitetura

- caminho no Core: `/var/lib/ramo-nessa/documents`;
- volume Docker dedicado: `driver_documents`;
- PostgreSQL guarda somente metadados e `storageKey` interno;
- Passenger/Driver/Admin não recebem caminho físico do arquivo;
- o Admin visualiza documento somente pelo proxy de inspeção autenticado e temporário do Core.

## Permissões

Antes do Core iniciar:

1. `document-storage-init` cria o diretório;
2. transfere a propriedade para UID/GID 1000 do processo Node;
3. aplica `0700` na raiz privada;
4. `document-storage-check` roda como usuário não-root;
5. cria um arquivo de prova `0600`, lê, valida e apaga;
6. o Core só inicia se o check terminar com sucesso.

Subdiretórios criados pelo storage local usam `0700`; documentos usam `0600`.

## Upload

O Motorista pode enviar:

- JPEG;
- PNG;
- PDF;
- limite máximo de 20 MB.

O Core valida tamanho, magic bytes/MIME e calcula SHA-256 antes de persistir os metadados. Um CRLV só pode ser enviado quando existe veículo cadastrado.

## Inspeção pelo Admin

A inspeção usa token AES-256-GCM de curta duração. O token inclui referência privada e metadados de integridade, mas não expõe `storageKey` na API normal do Admin.

Na leitura, o Core confere:

- validade do token;
- tamanho;
- MIME;
- SHA-256;
- assinatura/magic bytes do arquivo.

Respostas de inspeção são tratadas como privadas/no-store pelo fluxo do Core/Admin.

## Backup

`deploy/prod/backup.mjs` inclui o volume `driver_documents` junto do dump PostgreSQL.

O backup de documentos é criado em `driver-documents.tar.gz`, recebe SHA-256 no manifesto e é validado antes de o snapshot ser marcado como concluído.

O restore real não é automático e deve ser testado posteriormente em ambiente isolado.

## Retenção e exclusão

O sistema preserva histórico de versões de CNH/CRLV. Nenhuma limpeza automática de documentos antigos será ativada sem política formal de retenção/exclusão.

Antes do Go-Live ainda é necessário definir, com a política LGPD/jurídica e operacional:

- por quanto tempo documentos substituídos devem ser mantidos;
- tratamento após encerramento da conta/motorista;
- exceções por obrigação legal, fraude, disputa ou auditoria;
- rotina de exclusão/anonimização e evidência de execução;
- retenção e descarte dos backups que contenham esses documentos.

## Estado

O storage privado persistente, permissões, inspeção segura e backup estão preparados no repositório. Ainda faltam exercitar upload/revisão/backup/restore no VPS real e aprovar a política formal de retenção.
