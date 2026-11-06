# Atualização exclusiva do Motorista Web — 23/10/2026

Pacote pronto para instalação pelo operador. Não há acesso SSH à VPS neste ambiente; nenhuma atualização no servidor foi executada nesta etapa.

## Versões e evidências

- Fonte do aplicativo: `a133772531357e00eaa6ab385d06705dde610735`.
- Fonte do instalador final: `d139b5b114434317926bf6bfb7758558d3c711f2`.
- Branch operacional: `ops/driver-ride-redesign-web-20261023`.
- PR em DRAFT: https://github.com/iansilva23/ramo-nessa/pull/44.
- Aplicação: análise limpa, 117 testes e builds Web/Android/iOS previamente aprovados no run https://github.com/iansilva23/ramo-nessa/actions/runs/39960814381.
- Pacote configurado para `/motorista/`: análise limpa, 117 testes, build Web, configuração Maps/Firebase e testes reais do bundle compilado para login/recuperação de sessão/logout em Chromium e WebKit aprovados no run https://github.com/iansilva23/ramo-nessa/actions/runs/39983939822. Google e provedores externos foram substituídos por fixtures locais nesses testes.
- Instalador final: 9 testes de integridade de ZIP, 9 testes de contrato/troca e três ensaios completos com Caddy real e o ZIP exato aprovados no run https://github.com/iansilva23/ramo-nessa/actions/runs/39984799889. Cenários: publicação, falha após troca com retorno verificado e falha de recriação com Gateway ausente e recuperação verificada.

O instalador final reutiliza o ZIP já validado e verifica SHA-256 e fonte imutável. Não recompila nem distribui APK ou IPA. Nenhum merge é necessário para executar esse pacote revisado.

## Arquivos publicados

Release: https://github.com/iansilva23/ramo-nessa/releases/tag/driver-ride-web-a13377253135-r2.

| Arquivo | SHA-256 |
| --- | --- |
| `RamoNessa-Motorista-Web-a13377253135.zip` | `0cd8a874bdba37ea41caccca0bc8bb13468ceaf4973e11053277269816a0d8b8` |
| `Instalador-Motorista-Web-a13377253135-r2.tar.gz` | `34979d1d15571fb85d418b2cea02be70013a5466e698d5fcd5f96527fecb5e85` |

## Instalação pelo operador

Executar no terminal da VPS o conteúdo de `deploy/staging/install-driver-ride-web-a13377253135.sh`. O script baixa os dois arquivos acima, confere os hashes antes da extração e executa o instalador com sudo. Não faz checkout/reset do repositório em uso no servidor.

O instalador exige containers saudáveis do projeto existente, configuração Compose autocontida e mounts Web/Caddy esperados. Captura os modelos reais do Gateway, a imagem imutável, configurações, hashes e identidades dos demais serviços. Valida o ZIP e a configuração Maps/Firebase contra o Motorista ativo; copia o Passageiro atual sem alterar seus bytes; troca exclusivamente o mount `/srv/web` do Gateway mantendo sua imagem, ambiente, redes e demais mounts. A versão anterior permanece disponível. Antes/depois da troca, confere arquivos servidos via HTTPS, readiness e acesso ao ADM.

Em falha após tentativa de troca, tenta restaurar o modelo anterior e verifica o resultado; também cobre o Gateway ausente após falha de recriação. Não sobrescreve um Gateway alterado por outra operação. Registros e planos ficam privados em `/opt/ramo-nessa-driver-ride-web/a13377253135`. Se houver erro, enviar o resultado antes de repetir; nenhuma garantia de instalação real deve ser feita sem o retorno do terminal.

Mensagem de sucesso esperada: `MOTORISTA WEB ATUALIZADO. Passageiro, ADM, Core, banco e provedores preservados.` Depois, reabrir https://app.ramonessa.com.br/motorista/.

## Preservação e pendências

Nenhuma migration, escrita SQL, mudança de preços, credenciais, pagamento ou repasse é executada. Core/PostgreSQL/site não são recriados. ADM permanece na mesma imagem; Passageiro é copiado do runtime ativo. A troca do Gateway pode causar breve interrupção HTTP durante sua recriação.

Não há publicação nativa. Android/iOS precisam de novos pacotes futuramente a partir do código atualizado. Os testes automatizados não equivalem à validação em aparelhos reais nem à comparação visual completa dos quatro cartões. Permanecem as pendências já registradas no relatório do redesign: avaliação de passageiro sem operação existente e campos de total/tempo/distância ausentes no contrato. A distribuição Web deste pacote não cria operações ou dados fictícios para preencher essas lacunas.
