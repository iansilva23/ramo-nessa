# Preparação da atualização Web com base na leitura real da VPS

O operador executou o inventário de leitura em 05/11/2026 às 22:02:17 de Fortaleza (`2026-11-06T01:02:17Z`). O resultado foi `APP_REDESIGN_READ_ONLY_INVENTORY`, sem mudanças e sem âncora previamente preparada.

| Referência | Valor conferido |
| --- | --- |
| Baseline | `996eb5ddbdbbc9df2df2b21a062e66f0046e742cb9773a09ce4672539f41c628` |
| Core | `sha256:f607fce3d8d840cfb375436896f028268936baa0d3d50d0c4afa1959e1476d78` |
| Gateway | `sha256:26576e05e681ab18d1e7af5b9f0b43b1e6de966a04668900852a4f7c93679c73` |
| Web ativa | `/opt/ramo-nessa-web/releases/recovery-web-copy-h3pobi71/bundles` |
| Produto candidato | `0d8d865af3b27db8f7ea91663e0393aeb134b817` |

Core, gateway, PostgreSQL e mock Maps foram informados saudáveis. Os dois bundles correspondem à última release de recuperação de senha já conferida.

## Preparador sem ativação

`deploy/app-redesign/prepare-web.py prepare` exige a baseline completa acima, recalculada pelo inventário original com checksum fixado. Também confere os hashes dos dois ZIPs Web, a fonte, o perfil, os arquivos declarados e os hashes internos. Não usa os artefatos de diagnóstico não verificados.

O programa:

1. Revalida todos os serviços e a configuração ativa, sem imprimir valores privados.
2. Preserva uma cópia completa da árvore Web atual em uma âncora privada.
3. Monta a candidata em outro diretório, copiando os arquivos dos dois aplicativos. Preserva arquivos opcionais anteriores e tudo que estiver fora de Passageiro/Motorista. Exige que shell, Maps, push e pontes Web mantenham os mesmos bytes ativos.
4. Gera os arquivos Compose de retorno e da candidata com a mesma imagem de gateway. O único campo planejado para troca é a origem do bind `/srv/web`.
5. Usa somente `docker compose config` para provar que as opções resolvidas continuam iguais, incluindo os valores literais com `$`, redes e mounts. Não executa `up`, `restart`, `run`, migration, alteração financeira ou chamada de provedor.
6. Reconfere a baseline, a identidade/configuração dos containers, os arquivos montados e os hashes das cópias. Registra plano e resultado com acesso privado.

A âncora prevista é `/opt/ramo-nessa-security/app-redesign-0d8d865af3b2-996eb5ddbdbb`. Não sobrescreve uma preparação existente. Falha ou mudança concorrente exige revisão; não repetir automaticamente.

Sucesso esperado: `APP_REDESIGN_WEB_PREPARED`, `changesApplied=false`, `servicesRestarted=false`, `activationImplemented=false`, com caminho da âncora e SHA-256 do plano. Esse resultado comprova preparação, não ativação ou teste de rollback em funcionamento. O procedimento de ativação/retorno ainda será implementado e validado a partir do plano realmente gerado, antes de qualquer autorização de aplicação.

## Verificação

Os testes isolados cobrem hashes, origem, path traversal, duplicatas ZIP, mudanças de provedor, links, preservação da árvore ativa/ADM/arquivos opcionais, exclusividade dos comandos de leitura, confidencialidade da saída e permissões do plano. O teste com Docker Compose real compara modelos antes/depois e valores literais com `$`. Localmente ele é ignorado quando Docker não está disponível; o workflow existente do inventário executa a suíte no GitHub.

Os pacotes e testes do produto já aprovados continuam nas mesmas fontes. Não há reconstrução dos apps, alteração de mapas, Core, banco ou ADM. A instalação Web e a homologação física continuam pendentes.

## Resultado da preparação do pacote

Fonte do preparador: `a8140620018dab4d2138c31ed52cd78736af6d3a`. Run `42142340064` aprovado, com os 15 testes e Docker Compose real. A primeira execução do CI parou na propriedade dos arquivos simulados; o runner foi ajustado para criar/executar as fixtures como root, mantendo as exigências de permissão do procedimento.

Pacote de transferência: `RamoNessa-Preparacao-Web-20261105.zip`, 36.792.751 bytes, SHA-256 `244021b714756afcf2afe26f61ff9e49db45ea703b52d3b3eb323f10dee33b7b`. Contém os dois ZIPs Web aprovados, preparador, inventário original, instruções e checksums internos. Os 51 arquivos do Motorista e 54 do Passageiro foram conferidos pelo próprio leitor do preparador; índices e push correspondem aos hashes informados pelo operador. Os seis arquivos do ZIP de transferência também foram conferidos.

A âncora real ainda não foi criada na VPS. Próxima ação: transferir o pacote conferido e executar somente `prepare-web.py prepare`. Obter a saída pública com âncora e hash do plano. Não enviar o arquivo privado de plano ou seu conteúdo ao chat. A instalação e o código de ativação/retorno continuam pendentes.
