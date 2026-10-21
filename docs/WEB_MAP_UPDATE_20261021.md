# Seguimento dos mapas Web — homologação física pendente

A versão c639 foi instalada na VPS, mas o proprietário confirmou que o fundo do
mapa ainda fica vazio no iPhone/PWA. Esta candidata ajusta o gesto do mapa e a
ordem de retorno da busca e atualiza somente o plugin Maps Web para o patch
oficial 0.6.4+2, que evita bloquear onMapCreated quando tiles atrasam/falham.
A causa do fundo vazio no aparelho ainda não está
confirmada. Não repetir o reset nem a instalação do pacote c639.

## Versões e pacote

- Fonte dos bundles: 0ad3ba73cfe2a1265344de09c75309b95daac8dd.
- Ferramentas operacionais: dd9b68bc149a37c0456f5b05e229d426a5ed1455.
- Artifact configurado: 12365640705 do run 39641033029 aprovado.
- SHA-256 ZIP: 392f89862e0a46ad7010cb44618f2110f87cb1e3fd860e7c135beefefa84b46e.
- Preparação nova: /opt/ramo-nessa-regions/map-web-updates/0ad3ba73cfe2.
- Base instalada exigida: plano c639, SHA-256 dd59053306a0646817c4e7c4423332690a019834172fd8e7e5c7a4cc0158742a.

Somente Passageiro Web e Motorista Web. O Gateway é recriado com a mesma imagem,
ADM, ambiente e Caddy atuais. Core, banco, tarifas, financeiro, site e Android/iOS
não são atualizados. Não executar activate-regions-pricing.mjs para mapas.

## Preparação e ativação após autorização do responsável

Buscar a branch sem alterar o checkout. Extrair somente deploy/staging do commit
operacional informado para uma pasta temporária. Baixar o ZIP configurado e
conferir seu SHA-256; não instalar artifacts de revisão example.invalid.

Executar com sudo, usando o Node instalado:

```sh
node deploy/staging/prepare-web-map-update.mjs /caminho/absoluto/mapas.zip 392f89862e0a46ad7010cb44618f2110f87cb1e3fd860e7c135beefefa84b46e
```

Esperar MAPAS_WEB_PREPARADOS_SEM_ATIVACAO. Se o Web atual divergir da base auditada,
parar e conferir a nova versão; não contornar o bloqueio. Não repetir uma
preparação existente nem apagar suas pastas para tentar novamente.

A ativação explícita usa o SHA-256 retornado para o plano privado da VPS:

```sh
node deploy/staging/activate-web-map-update.mjs /opt/ramo-nessa-regions/map-web-updates/0ad3ba73cfe2 SHA256_DA_PREPARACAO
```

O SHA do plano difere do SHA do ZIP. A ferramenta revalida serviços, modelos,
Caddy, configuração e ambos os bundles antes de recriar somente o Gateway.
Compara os bytes publicados dos dois Web. Em falha, restaura e verifica o bind
anterior; conserva os bundles antigos. O journal registra completed, rolled-back
ou requires-review. Em requires-review, não repetir: conferir o erro privado e a
identidade atual. Não compartilhar logs privados, tokens ou configurações.

## Evidência e limites

O ZIP foi validado: 108 arquivos, manifesto/source e hashes corretos. As opções
Maps/Firebase dos dois aplicativos continuam iguais às da instalação c639.
Os quatro fluxos compilados de sessão passaram em Chromium/WebKit com serviços
sintéticos. A opção de gesto recebida pelo SDK simulado é conferida no Passageiro;
o fixture de login do Motorista não fornece cadastro operacional ou GPS.

Run 39641032929: seis jobs de regressão aprovados. Run 39641033029: builds
configurados e quatro checks Chromium/WebKit aprovados. O controle negativo
reproduziu a inicialização bloqueada no bundle anterior com tiles suprimidos;
a candidata iniciou a câmera sem tiles no stub. Isso valida a regressão da
biblioteca, não o desenho real do Google no Safari físico. Os testes do gesto,
transição e alfinete também passaram. 22 contratos Node e seis Python passaram
localmente. Run 39670229404 da revisão dd9b aprovado nos três cenários:
instalação original compatível, rollback legado em banco sintético e upgrade
c639 → 0ad com falha provocada/retorno verificado ao c639. Catálogo, corridas,
pagamentos e ledger permaneceram iguais no upgrade/retorno dos mapas.
Run 39670229542: contratos operacionais aprovados. Nenhum desses ensaios
executou a atualização na VPS do proprietário.

## Aceitação no iPhone

Após instalação autorizada, fechar completamente e reabrir os aplicativos sem
apagar dados. Testar separadamente:

1. Escolher destino: fundo e rota aparecem sem tocar no mapa.
2. Primeiro arraste com um dedo: mapa move sem aviso de dois dedos.
3. Repetir busca, trocar origem/destino e voltar de outra tela: fundo continua visível.
4. Voltar após bloquear/desbloquear a tela e conferir rota/controles.

Se o gesto funcionar mas o fundo continuar vazio, não concluir que eram o mesmo
defeito. Capturar eventos de tiles/erros do SDK na sessão física antes de alterar
outra parte da renderização. Registrar modelo do iPhone/iOS e vídeo do caso sem
publicar dados pessoais. Não limpar dados/reinstalar, mudar credenciais ou
recriar mapas em loop como substitutos da investigação.
