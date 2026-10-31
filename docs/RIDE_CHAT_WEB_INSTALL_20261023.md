# Instalação do chat Web sobre o runtime auditado

Aplicativo fonte: `75ca2b7c3d9a97cfaa6f48a3748c2f12867a19f1`, aprovado no [run 39999319953](https://github.com/iansilva23/ramo-nessa/actions/runs/39999319953), PR #45. Instalador isolado no PR #46, sem merge na main e sem publicação móvel.

A inspeção executada pelo responsável na VPS confirmou:

- Core ativo `sha256:0ce73359ca20693a584b2a4ae1c20da170288066fae58f0667c07599d18bc519`, assinatura compilada `f12e074fac62f344692b62cc98d078f2a93d4f4fb405b903d435ea6491a05d5c`. A recompilação local da base `7fd822356f84c435d28c0c43b2bcbf585e306710` reproduziu a assinatura inteira, os grupos e o package-lock.
- Gateway ativo `sha256:7b3a5eaf7089157f5b57e943a45526bb4da79bcb29fcf7ef8dad370ba657d10b`.
- Web ativo em `/opt/ramo-nessa-web/releases/driver-ride-a13377253135/bundles` e Caddy ativo no bind já existente, assinatura `23007273d7b9939333a91ff72419f1761adaf63f269433e0aa0eb8d9336eff46`.
- `passenger/main.dart.js` e `passenger/index.html` iguais ao release `checkout-window-web-032e973b`, conferidos pelo ZIP SHA-256 `6d5712bcaf0a7ffc304d412630af34ea9518abd7524069ff18bc70f5a54288d1`. Não há diferença de fontes Passageiro/Core entre aquele release e a base desta funcionalidade.

## Escopo e retorno

O instalador reutiliza a imagem exata do Gateway e o Caddy existente. Constrói uma derivação da imagem Core ativa, copiando somente quatro arquivos compilados do chat e seus mapas, além da migração 089. O restante do Core deve manter a assinatura inteira esperada. Os novos bundles Passageiro/Motorista devem manter os mesmos valores públicos de Maps e Firebase dos bundles ativos.

Antes da troca, confere imagens, fontes, Web, Caddy, ADM, configurações Compose e ambiente literal; cria backup com restauração isolada e fixa o estado preparado em arquivos privados. Depois aplica somente a tabela aditiva de leitura, troca Core e depois Web e confere arquivos públicos, saúde e permissões de GPS por HTTP.

O retorno recupera os serviços anteriores e mantém a tabela aditiva, sem restaurar dados financeiros antigos. Também prevê recriação do Gateway se a tentativa de troca o tiver removido. O container do banco, mapas, site institucional, imagens do ADM/Gateway, catálogo e configurações dos provedores são preservados. Atualizações concorrentes detectadas interrompem a operação.

`prepare` monta e verifica a preparação sem reiniciar serviços. `activate` ativa a preparação fixada por SHA-256. `install` executa os dois passos em sequência. Os diretórios preparados e o diário são mantidos para auditoria; uma instalação já iniciada não é repetida automaticamente.

Este workflow disponibiliza arquivos para instalação e não acessa a VPS. Somente a execução posterior pelo responsável instala a funcionalidade.

## Validação e pacote disponibilizado

[Run 40001048444](https://github.com/iansilva23/ramo-nessa/actions/runs/40001048444), commit do instalador `bfb867117f47fe94b87b8ef4172a21ebb4124d7c`, com os dois jobs concluídos com sucesso:

- 21 contratos Node e três testes Python de extração aprovados, incluindo os dois papéis, integridade e rejeição de caminhos inválidos.
- Dois builds Web configurados e verificados; payload de 113 arquivos. Assinatura do Core candidato: `8ae023ae3fc135fd535112ac2e2149f7d639c52b3b3d73e588055d8f06866dfb`.
- Sessão, retorno à aba e logout aprovados em Chromium e WebKit nos dois papéis.
- Ensaio Docker real com PostgreSQL, Core e Caddy: backup e restauração isolada conferidos nas quatro preparações; alteração concorrente de Caddy bloqueada; falhas após Core, após Web e com Gateway removido retornaram às versões anteriores; instalação bem-sucedida conferida por HTTP.
- Preservação verificada do ADM, imagem Gateway, Caddy, configurações literais de provedores, dados financeiros, catálogo e serviços não relacionados. A migração foi reaplicada sem duplicar seu registro.
- Envio HTTP autenticado de mensagem, contador, contato WhatsApp e leitura aprovados; o contador permaneceu zerado após recriação do Core, comprovando persistência do recibo.

Release de arquivos: [ride-chat-web-75ca2b7c-r1](https://github.com/iansilva23/ramo-nessa/releases/tag/ride-chat-web-75ca2b7c-r1).

| Arquivo | SHA-256 |
| --- | --- |
| RamoNessa-Chat-Web-75ca2b7c.zip | `00220b162e99aa57b604ade3d4a3eabb4370ea28e3aedcf98ca42cc0a1d63966` |
| Instalador-Chat-Web-75ca2b7c-r1.tar.gz | `4d244e17e1ba715778a98b3e86d878dca63bfa79d9686b1da35a8285b77cbf59` |

A disponibilização do release não instalou nada na VPS. A aceitação real da corrida e do contato no WhatsApp depende da execução posterior do comando pelo responsável e da conferência dos dois aplicativos no navegador. Android/iOS não foram publicados; a main não foi mesclada.
