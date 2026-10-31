# Atualização autorizada da VPS real — corridas integradas

Autorização explícita recebida: “eu quero atualizar pra nova versao entao”. Não há autorização para ligar os recursos A/B/C, alterar regras financeiras, fazer merge ou publicar versões nativas. O alvo é o serviço efetivamente usado, apesar do nome Docker ramo-nessa-staging.

## Pacote aprovado

Aplicação: 3c5fa5e5ab635fac7654895d5a4bd6909cd6360a. Instalador: revisão 694b793f4d8d31c469bf1d61196952f26e42b307, adaptando a estrutura do PR #69 à base instalada #67 e ao Web GPS Cinema #71. Nenhuma modificação de código de aplicação foi feita nesta branch operacional.

Execução aprovada: https://github.com/iansilva23/ramo-nessa/actions/runs/40239365854. Compilação configurada dos dois aplicativos, testes Chromium/WebKit, backup com restauração isolada, migrações aditivas 096/097, preservação financeira e de provedores, recusa de base/configuração divergente, falhas depois de Core/Web e recuperação de gateway removido. Retorno não restaura banco antigo; se houver adoção nova, mantém o Core compatível.

Release: https://github.com/iansilva23/ramo-nessa/releases/tag/ride-consistency-web-20261025-r1

| Arquivo | SHA-256 |
|---|---|
| RamoNessa-Corridas-Integradas-Web.zip | 88f31af0bed995cd95ec3ede7e7033522ce3851cc6364bc0a1501f5581c14169 |
| Instalador-Corridas-Integradas-Web.tar.gz | 3817b1d43deda0b6ce6d5ac9b76945432f44823d6cd352dd91574f2bc05d8792 |

Os hashes acima também foram confirmados no digest de cada asset publicado pelo GitHub. O pacote é imutável por hash. O instalador verifica o ZIP, cada arquivo, a assinatura do Core e do ADM ativos e a continuidade das migrações antes da troca.

## Comportamento da instalação

1. Confere base ativa: Core compilado e dependências da revisão #67; Web em /opt/ramo-nessa-web/releases/driver-cinema-d8ddfb102f88/bundles.
2. Registra configurações/ambientes privados sem imprimir segredos, cria backup e comprova restauração em isolamento.
3. Constrói camadas de arquivos sobre as imagens realmente ativas, preservando inicialização, provedores, volumes e rede; mantém Caddy intacto.
4. Adiciona 096/097 e exige A/B/C desligados. Não exclui dados e não altera catálogo, saldos, métodos de pagamento ou taxas configuradas.
5. Troca Core e depois gateway/Web, verifica saúde e hashes públicos, e grava comando de retorno e recibo persistente.

Pasta da operação: /opt/ramo-nessa-ride-consistency-web/3c5fa5e5ab63. O instalador preserva a versão Web anterior e não reaproveita o instalador antigo #62. Backups podem exigir alguns minutos e a troca de containers pode causar uma reconexão breve.

## Estado

Instalação confirmada pela saída enviada pelo responsável em 25/10/2026: `CORRIDAS_WEB_ATUALIZADAS`, fonte `3c5fa5e5ab635fac7654895d5a4bd6909cd6360a`, Passageiro/Motorista Web e ADM atualizados, configurações dos provedores preservadas e A/B/C false. O instalador retornou `webAcceptancePending:true` e `nativeAppsUpdated:false`; a conferência visual do usuário ainda é necessária.

Backup verificado: `/var/backups/ramo-nessa-regions/2026-10-25T22-43-26-471Z-7785961b8d12079140d8`. Manifesto `06c7e3134ceebe388d50edf9839ad31018dbfdd1a47629f384d97628738fac32`. Recibo de preparação `286566c08f2286a37c43b6d8ff6e38444156700f2fcd9a1e34256ab5ff5df824`. A restauração em isolamento passou; não houve restauração do banco ativo. Após instalar: confirmar /ready, migrações até 097, A/B/C false, novos artefatos, tentativas expiradas no Histórico, cancelamentos reais em dinheiro com autoria correta, recuperação por Atividades e GPS Cinema preservado. O diagnóstico pós-instalação é somente leitura. Android/iOS nativos e testes financeiros reais ficam fora deste instalador.
