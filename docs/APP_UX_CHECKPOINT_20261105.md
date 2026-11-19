# Continuidade do redesign dos apps — 05/11/2026

## Escopo aprovado
Somente aplicativos Passageiro e Motorista, incluindo Web, Android e iOS. **Não modificar o ADM**: Ian confirmou que já está como deseja.

Concluir o redesign completo e suas verificações antes da primeira atualização. A segunda atualização reúne as pendências funcionais, de desempenho e de publicação. Não publicar blocos intermediários. As branches e PRs abaixo permanecem em rascunho; nenhum deploy foi feito nesta etapa.

## Evidências disponíveis
- PR #103: acesso, permissões, estágios de corrida, seta do Motorista em percurso e toque original. Validação já registrada no PR.
- PR #104: Configurações.
- PR #105: Suporte/Notificações; run 42065001844 aprovado.
- PR #106: Segurança/Privacidade; run 42069666106 aprovado.
- PR #107: Documentos, Ranking/Benefícios, Ajuda, Carteiras, Extrato e Cupons. Código 097adc6c123bec69512e1f58bf980cbe0019e316; run 42079467704 aprovado nos quatro jobs.
- PR #108: Perfil, Atividades/Histórico, Endereços, Chats, Resumo de corridas, contraste da navegação e Guia Local. Código 81bc189f45098fb8e63423aa561048bf60c2f688; run 42079474363 aprovado nos quatro jobs.
- PR #109: Busca, escolha de veículo, confirmação/pagamento, lista de passeios e detalhes do Perfil/Endereços. Último código c391b87271c0758cf5bb55d1ee44f93663fb0edf; run 42083772396 aprovado nos quatro jobs: análise, testes e builds Web, Android debug e iOS simulador.

Os quatro jobs incluem análise, testes e builds Web, Android debug e iOS simulador. Esses builds não são os instaladores assinados para as lojas nem comprovam funcionamento em aparelhos reais.

## Revisão visual
O run 42081769364 gerou capturas sintéticas dos dois apps. Foram inspecionados os saldos e a ação Pix do Motorista, o Extrato, Documentos, Ajuda, Benefícios, Ranking, Perfil, Endereços, Chats, escolha de veículo, passeios e pagamento, em diferentes combinações de tema e largura. A primeira inspeção não abrangeu todas as combinações.

Correções motivadas pelas imagens:
- Saldos do Motorista em coluna com pouco espaço; valores do extrato acima da descrição.
- Status de recarga e ícones legíveis no tema escuro.
- Campos de preferências com rótulos mais curtos.
- Cabeçalhos longos admitem duas linhas com fonte ampliada.
- Categoria e preço do veículo usam disposição vertical em telas estreitas.
- Selo de pagamento indisponível tem linha própria quando falta espaço.
- Perfil permite quebra de nome/e-mail; telefone descrito como cadastrado.
- Telas internas de Dados pessoais, Formas de pagamento e edição de endereço usam largura máxima e área segura.

O run visual 42083804026 passou nos quatro jobs. Inspeção das Formas de pagamento em tema escuro e em 320 px/fonte 1,4 confirmou textos, ícones e selos legíveis após mover os selos para baixo da descrição. Os títulos dos chats foram ajustados para duas linhas.

Nenhum teste de captura envia OTP, cobra Pix, faz reserva ou usa localização real. Mapas em algumas capturas são placeholders; não comprovam GPS ou Google Maps.

## Trabalho restante
1. Validação da última revisão concluída; continuar inventário e revisão dos estados restantes.
2. Fechar inventário das rotas ativas e estados: não declarar redesign de todas as telas concluído apenas por ter adaptado arquivos principais.
3. Revisar detalhe de passeio, formulário de senha do Motorista e estados secundários/modais ainda sem evidência visual recente, preservando mapas e funcionalidades.
4. Consolidar a cadeia de PRs e preparar a primeira atualização com retorno verificável; não houve merge/deploy.
5. Segunda atualização: exclusão de conta pelo próprio usuário e página pública, documentos legais, requisitos atuais das lojas, builds assinados, demonstração para revisores e materiais oficiais.
6. Homologação em aparelhos: GPS/segundo plano, push e som em aberto/minimizado/bloqueado, corrida, Pix, cancelamento/estorno, reconexão e restauração. Medir desempenho nas plataformas reais.

A opção atual de eliminação em Privacidade é uma solicitação; não afirmar que já exclui automaticamente conta e saldo. Recuperação por e-mail/WhatsApp e aviso de spam foram confirmados por Ian em implantação anterior; não gastar créditos repetindo testes de entrega sem necessidade.

## Retomada técnica
- Branch de produto: feature/checkout-tours-ux-20261105, PR #109.
- Branch de capturas: audit/app-flow-visual-20261105.
- Ambiente local restaurado. Últimas mudanças feitas pelo conector GitHub e verificadas pelo CI.
- Prompt mestre existente: RamoNessa_Prompt_Mestre_Completo_2026-11-03.md, versão 50 salva com os resultados acima e próxima ação. Redesign completo ainda não concluído.
