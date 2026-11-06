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

## Resultado conferido e aplicação pendente

Run `42145264386` aprovado: 27 testes, sem skips, em 74,095 segundos. Os dois ensaios Docker/PostgreSQL reais passaram: bloqueio por corrida em andamento seguido de ativação/idempotência/retorno manual; falha injetada depois da troca seguida de retorno automático. Ledger fictício, ADM e identidade dos outros containers conferidos. A suíte local teve 24 aprovações e três testes Docker ignorados por falta de Docker local. Não foram repetidos builds/testes de produto sem mudança no produto.

Fonte exata do ativador e dos ensaios: `fc452315b3abd62fab2f88c694d0d641f94312ac`. SHA-256 de `activate-web.py`: `39a14705517a300111e9ae11b6f5a7d1ab64d935fb3f370bb15c4f9290ae053f`. A comparação contra a fonte dos apps confirma alterações somente em 12 arquivos de operações, workflows, testes e documentação, sem código de apps, ADM ou backend.

A VPS ainda está na versão Web anterior: apenas a preparação foi executada pelo operador. A próxima decisão é autorizar a aplicação real dos dois bundles Web. Será recriado somente o gateway com a mesma imagem e configurações, mudando o bind preparado. Pode haver breve interrupção do gateway. Isso não instala APK/IPA nem comprova homologação em aparelho.

Depois de autorização, o ativador pode ser obtido do caminho fixado:
`https://raw.githubusercontent.com/iansilva23/ramo-nessa/fc452315b3abd62fab2f88c694d0d641f94312ac/deploy/app-redesign/activate-web.py`

Conferir o SHA-256 acima e executar com sudo somente o modo `activate`. O script copia a si mesmo para a âncora antes da troca e guarda seu hash no registro. Saída esperada após conferência pública: `APP_REDESIGN_WEB_ACTIVATED`. Se falhar, analisar o resultado e o registro privado; não afirmar que aplicou ou retornou sem confirmação.

O retorno desta atualização, quando necessário, é `sudo python3 /opt/ramo-nessa-security/app-redesign-0d8d865af3b2-996eb5ddbdbb/activate-web.py rollback`, após conferir o checksum do arquivo preservado. Não executar ativação e retorno em sequência por rotina. O retorno recusa outra publicação e não restaura banco.
