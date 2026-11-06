# Ativação Web vinculada ao plano gerado na VPS

O operador concluiu `APP_REDESIGN_WEB_PREPARED` e informou:

- Fonte: `0d8d865af3b27db8f7ea91663e0393aeb134b817`.
- Âncora: `/opt/ramo-nessa-security/app-redesign-0d8d865af3b2-996eb5ddbdbb`.
- Candidata: `/opt/ramo-nessa-web/releases/app-redesign-0d8d865af3b2-996eb5ddbdbb/bundles`.
- Plano SHA-256: `9dc6f5df39666007241072b2e1dfde6db4581a06a01364fdcc1ae67ef096d525`.
- `changesApplied=false`, `servicesRestarted=false`, `activationImplemented=false` nessa preparação.

O plano privado não foi enviado ao chat. O ativador exige o checksum exato acima ao lê-lo localmente na VPS.

## Procedimento implementado, ainda sem aplicação

`deploy/app-redesign/activate-web.py` possui três modos explícitos: `verify`, `activate` e `rollback`. Nenhum modo é executado automaticamente por download ou importação. O arquivo é único e reutiliza o helper de segurança anterior, exigindo seu checksum conhecido.

Antes da troca, confere plano, preparação concluída, árvore antiga/cópia/candidata, configurações Compose, credenciais montadas por hash, identidade/saúde dos demais serviços e gateway original. Reinterpreta os Compose para provar que só muda o bind `/srv/web`. Confere a base pública por GET, incluindo índices, JavaScript principal e push dos dois apps, readiness e canais de recuperação.

A guarda de corridas lê a atividade via Core/PostgreSQL usando o helper existente; corrida/busca/pagamento ativo impede a troca. O processo usa a mesma trava operacional dos instaladores anteriores, grava seu próprio código na âncora e registra a transição atomicamente.

A única recriação é `docker compose ... up ... --no-deps --no-build --pull never ... gateway`, com a mesma imagem do gateway. Core, PostgreSQL, mock, banco, volumes e código do ADM não são atualizados. Pode haver breve interrupção do gateway durante a recriação. Depois confere configuração/saúde, arquivos e rotas públicas; só então registra conclusão.

Falha depois de iniciar a troca tenta retorno automático ao modelo anterior desta mesma âncora. O retorno exige os arquivos anteriores íntegros e que o gateway ainda pertença a essa publicação; recusa imagem, mount ou arquivo Compose de outra versão. Não restaura banco. Se o retorno não puder ser confirmado, registra revisão necessária e não repete a ativação. Ativação já concluída é verificada sem reiniciar; transição incompleta ou retornada exige revisão.

## Validação isolada

Os testes unitários cobrem plano divergente, mudança exclusiva do mount, release posterior, transição incompleta, registro atômico, repetição após conclusão e sondas sem envio de códigos.

O ensaio Docker é explicitamente habilitado apenas no CI, com projeto aleatório `ramo-redesign-rehearsal-*`, rede interna, servidor HTTP fictício e PostgreSQL descartável com ledger e corridas sintéticos. Usa o preparador real, o ativador real e a consulta real da guarda de atividade. Testa corrida ativa impedindo a troca, ativação/idempotência/retorno manual e falha injetada depois da troca com retorno automático. Confere identidade dos outros containers, ledger e ADM preservados. Recursos próprios são removidos; não acessa a VPS, dados reais ou provedores pagos.

Homologação no aparelho e aplicação na VPS não são comprovadas por esse ensaio. A autorização vigente nesta etapa continua de preparação; aguardar autorização explícita para executar `activate`.
