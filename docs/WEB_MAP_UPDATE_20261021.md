# Atualização dos mapas Web — homologação

Pacote aprovado: c6390a6d55610c5bcb45d78ddd03b623d23fe124.
Ferramentas operacionais aprovadas: 9ab768635d8763db030e8aa850f11be5dabcdf5a.
ZIP: artifact 12355793923 do run 39623811345.
SHA-256: 872e17e87dedd8cf8410b5e0103c5ba1f0a747aaa94e4b6e16c2e86d3338b19a.

## Escopo e evidência

Somente Passageiro Web e Motorista Web. Gateway recriado com a mesma imagem,
mesmo ADM, mesmo ambiente e Caddy atual. Core, banco, catálogo, tarifas,
financeiro, site e Android/iOS não são atualizados. Não executar novamente o
reset nem activate-regions-pricing.mjs para instalar os mapas.

O run 39631036259 passou nos três cenários: instalação original com pacote
compatível, rollback do catálogo original exclusivamente em banco sintético e
instalação dos mapas com falha provocada/retorno verificado. A instalação dos
mapas e o retorno usaram Docker, Core, PostgreSQL e Caddy reais, isolados dos
serviços da VPS. Arquivos servidos foram conferidos por HTTP. Catálogo, corridas,
pagamentos e ledger permaneceram iguais durante os ensaios dos mapas.

## Operação após autorização do responsável

Baixar o ZIP configurado do run indicado; nunca instalar o artifact de revisão
que usa example.invalid. Buscar a branch sem alterar o checkout e extrair somente
as ferramentas do commit operacional informado para um diretório temporário.

Executar com sudo:

```sh
node deploy/staging/prepare-web-map-update.mjs /caminho/absoluto/mapas.zip 872e17e87dedd8cf8410b5e0103c5ba1f0a747aaa94e4b6e16c2e86d3338b19a
```

A preparação deve retornar MAPAS_WEB_PREPARADOS_SEM_ATIVACAO. Se informar que o
Web atual mudou, parar e auditar a nova versão; não contornar o bloqueio. Não
repetir uma preparação existente nem apagar suas pastas para tentar novamente.

Conferir a preparação privada e seu SHA-256 retornado. A ativação explícita usa:

```sh
node deploy/staging/activate-web-map-update.mjs /opt/ramo-nessa-regions/map-web-updates/c6390a6d5561 SHA256_DA_PREPARACAO
```

O SHA é específico do plano da VPS; não é o SHA do ZIP. A ferramenta revalida os
serviços, hashes dos modelos, Caddy, configuração e ambos os bundles antes de
recriar somente o Gateway. Compara os bytes publicados dos dois Web. Em falha,
restaura e verifica o bind anterior; preserva todos os arquivos antigos. O
journal privado registra completed, rolled-back ou requires-review. Se houver
requires-review, não repetir: inspecionar o erro privado e a identidade atual.
Nenhum log privado, token ou configuração deve ser colado em chats públicos.

## Aceitação no iPhone

Após instalação, abrir os dois aplicativos instalados na tela inicial. Testar
escolha de rota sem tocar no mapa, alteração rápida de destino, GPS atrasado,
retorno de outra tela e bloqueio/desbloqueio. Depois testar rotas e andamento da
corrida. Não usar uma corrida paga real apenas para teste. Os mocks e testes de
Chrome/WebKit não comprovam tiles Google/GPU nem substituem um iPhone físico.
A tela branca só será marcada como resolvida após essa homologação.
