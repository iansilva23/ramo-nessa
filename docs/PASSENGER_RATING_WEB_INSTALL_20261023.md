# Avaliação do passageiro — Motorista Web

Fonte do aplicativo: `8af62ee4b103d1433510605b0dd4ea66b2d8cb83`, PR #47. Instalador: PR #48. A alteração segue a referência enviada pelo responsável e é ativada primeiro na Web.

O motorista abre “Avaliar passageiro” na corrida concluída ou no histórico. Escolhe de uma a cinco estrelas, motivos e comentário opcionais. Nenhuma estrela começa selecionada. “Agora não” permite avaliar depois. Uma avaliação salva é consultável e imutável; reenvios retornam a avaliação original. Somente o motorista da corrida concluída pode gravá-la.

## Validação do aplicativo

[Run 40007285380](https://github.com/iansilva23/ramo-nessa/actions/runs/40007285380), revisão exata acima:

- Core: typecheck, build, migração duas vezes, 872 testes aprovados e 11 condicionais ignorados. PostgreSQL real verifica persistência e oito envios concorrentes.
- Motorista: analyze, 129 testes e build Web aprovados.
- Passageiro: analyze, 229 testes e build Web aprovados.
- Capturas revisadas em três dimensões, incluindo tela estreita e teclado. Estrelas amarelas, motivos selecionáveis, comentário, confirmação e saída seguem a referência.

## Instalação e preservação

A base é o chat Web `75ca2b7c3d9a97cfaa6f48a3748c2f12867a19f1`, cuja instalação foi confirmada pelo responsável. O instalador confere o plano privado anterior pelo SHA-256 `8fd8e22c984615919611c083a75b475aca4527e40a6aa39dc5731fea2b283538`, sua imagem Core e o diário de ativação concluído. Também confere arquivos Web, Caddy, ADM, ambiente literal, catálogo e configuração Compose.

O payload substitui somente o bundle Motorista e quatro arquivos JavaScript do Core com seus mapas. A migração 090 acrescenta a tabela de avaliações. Passageiro Web é copiado sem alterar bytes; Gateway, ADM, Caddy, provedores, chat e dados financeiros permanecem preservados.

Antes de ativar, cria backup com restauração isolada. Troca Core e depois Web, conferindo saúde e arquivos públicos por HTTP. Em falha da troca, recupera os serviços anteriores e mantém a tabela aditiva; não restaura dados financeiros antigos. Diretórios privados e diário são conservados para auditoria.

`rating-web-update.mjs install ZIP_ABSOLUTO SHA256` executa preparação e ativação. A instalação já iniciada não é repetida automaticamente. Se houver erro, enviar a saída para diagnóstico antes de tentar novamente.

A disponibilização dos arquivos não instala na VPS. A execução pelo responsável e a aceitação no navegador continuam necessárias. Android/iOS não são distribuídos e a main não é mesclada.

## Pacote verificado

Instalador exato `ed3ee4e442cf1266f4b18fdc61baa9e1227949e2`, [run 40007537818](https://github.com/iansilva23/ramo-nessa/actions/runs/40007537818), ambos os jobs aprovados. Contratos Node e extração Python, build configurado, sessão Chromium/WebKit e ensaio Docker real aprovados. Quatro backups tiveram restauração isolada verificada. Alteração concorrente bloqueada; falhas após Core, após Web e remoção de Gateway recuperadas. Envio/leitura/WhatsApp do chat e avaliação autenticada conferidos por HTTP, inclusive persistência após recriação do Core e reenvio idempotente.

Release: [passenger-rating-web-20261023-r1](https://github.com/iansilva23/ramo-nessa/releases/tag/passenger-rating-web-20261023-r1).

| Arquivo | SHA-256 |
| --- | --- |
| RamoNessa-Avaliacao-Passageiro-Web.zip | `5d1e87c9f1885db58f149444155d3489b8e87f04e7859c5f444ee4239f85151c` |
| Instalador-Avaliacao-Passageiro-Web-r1.tar.gz | `6f64888549e08f405f94c2fe8573b335224f0ff9889dfa0248ba629afee437b8` |

Após a execução na VPS, conferir `RATING_WEB_ATUALIZADO`. Abrir `/motorista/`, entrar com um motorista e usar uma corrida concluída: avaliar, confirmar e reabrir para conferir a nota persistida. Testar “Agora não” e o acesso pelo histórico. Conferir mensagem, contador e contato no chat. A aceitação pelo responsável em dispositivo real permanece pendente até essa conferência.
