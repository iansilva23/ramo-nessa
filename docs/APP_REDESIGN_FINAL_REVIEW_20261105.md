# Revisão final e preparação da primeira atualização dos apps

Código do candidato: `9b369565b01247ed81396d22be180aad676d180f`. Base: `210ccb00837b543ed223c7b94664f0bba046901e`.
PR consolidado: #110. Branch: `release/app-redesign-review-20261105`.

## Escopo fechado
Revisão do código das 41 telas Flutter e dos componentes secundários de embarque, avaliação, cancelamento e recuperação. As telas que delegam componentes compartilhados foram tratadas pelo componente, sem duplicação. A avaliação é do candidato de código; não é homologação física nem aprovação das lojas.

ADM e backend fora do escopo: comparação completa contra a base confirma zero arquivos alterados nessas duas árvores. As regras de preço, prazo de cancelamento, repasses, autenticação e persistência de corrida foram preservadas.

## Cobertura da revisão
| Grupo | Evidência |
| --- | --- |
| Acesso, cadastro, permissões, notificações | Capturas e testes dos PRs #103–#105; recuperação por e-mail/WhatsApp preservada |
| Configurações, Suporte, Segurança e Privacidade | Capturas em 320 px/fonte 1,4 e tema escuro; testes de falha, recuperação e preferências |
| Perfil, Dados pessoais, Veículo, endereços e histórico | Largura adaptável, área segura, títulos longos em duas linhas; navegação por componentes existentes |
| Documentos, benefícios, carteiras, extratos e cupons | Capturas de início/fim, contraste e métricas; testes de carregamento, regras de recarga, valores e antecipação |
| Busca, categorias e pagamento | Nomes e preços legíveis em largura pequena, selos de disponibilidade, confirmação; testes de cotação e política de pagamento |
| Início, percurso, Guia Local, lista e detalhe de passeios | Capturas sintéticas; preservação de câmera/gestos/localização; seta do Motorista somente no estágio aprovado |
| Embarque/coleta | Diálogo com rolagem e teclado; três dígitos e tentativas preservados; cartão do Passageiro ativo e bloqueado |
| Avaliação do Passageiro | Estados inicial, registrada e falha; comentário/repetição preservados; botão desabilitado sem estrelas |
| Cancelamento e devolução | Prazo gratuito, confirmação, dados Pix, aprovado e devolvido; serviços simulados sem movimentação real |
| Recuperação de corrida/pagamento | Suíte existente cobre recuperação, pagamento pendente e falhas sem nova cobrança; título de consulta adaptado |

As imagens de mapa usadas na revisão da tela inicial têm placeholder. Não usar capturas como prova de GPS, push, MP, entrega OTP ou desempenho real. A avaliação do Passageiro mantém a superfície clara aprovada dentro do modal, inclusive quando o aplicativo usa tema escuro.

## Componentes preservados
- `driver_terms_screen.dart`: arquivo legado com rascunho; não foi ativado nem substitui documentos legais da rota real de Privacidade.
- `card_checkout_screen.dart` e `web_card_entry_screen.dart`: código opcional de cartão preservado, sem ativar meios desabilitados.
- `saved_place_pin_screen.dart`: mapa e seleção preservados, com testes existentes de ciclo de vida.
- Histórico e Notificações são wrappers de componentes compartilhados; não foram recriados.

## Ajustes finais
Área segura e largura máxima nas páginas internas do Motorista; rótulo do motivo de cancelamento com espaço para texto; cabeçalhos longos de histórico, privacidade, suporte, extrato e ocorrência com duas linhas. O diálogo de embarque admite rolagem com teclado. A ajuda de telefone/CPF do formulário Pix admite múltiplas linhas.

O teste visual passou a aguardar a animação de tamanho do cancelamento antes do toque, sem remover a confirmação nem enfraquecer as asserções. A revisão de imagens aguarda também a transição da cor do botão ao habilitá-lo, apenas no gerador de capturas. Contas, avaliações, códigos e valores são sintéticos.

## Validação e pacote
A revisão anterior c72b62e passou nos quatro jobs do run 42118763504. A validação consolidada deste candidato está no run 42120693988; conferir conclusão antes de classificá-lo como aprovado. O gerador visual final está no run 42121071889.

O workflow gera `RamoNessa-Redesign-Fonte.tar.gz`, `SOURCE_COMMIT.txt`, `CHANGED_FILES.txt` e `SHA256SUMS` somente após os quatro jobs aprovarem. A fonte é a referência única para compilar os dois aplicativos. Ambos os pubspecs conservam `0.1.0+1`; números oficiais de build devem ser definidos juntos ao gerar os instaladores.

## Aplicação posterior
Não houve merge, instalação na VPS ou publicação. O pacote é de fonte validada, não um instalador ou bundle com configuração operacional. Builds de verificação usam example.invalid e não devem substituir os apps em uso.

Para aplicar: obter a identificação da release ativa, preservar configuração pública/assinatura e criar âncora de retorno; compilar Passageiro e Motorista a partir do mesmo commit; trocar somente os apps e conferir as rotas; manter Core, banco, volumes e ADM. Não copiar os exemplos de configuração do CI para a VPS. Os instaladores oficiais e a homologação física seguem na segunda etapa combinada.

## Inventário
- `apps/driver/lib/src/core/auth/driver_password_login_screen.dart`
- `apps/driver/lib/src/core/auth/driver_password_setup_screen.dart`
- `apps/driver/lib/src/features/finance/presentation/driver_statement_screen.dart`
- `apps/driver/lib/src/features/finance/presentation/driver_wallet_screen.dart`
- `apps/driver/lib/src/features/home/presentation/driver_home_screen.dart`
- `apps/driver/lib/src/features/home/presentation/driver_ride_chat_screen.dart`
- `apps/driver/lib/src/features/profile/presentation/driver_documents_screen.dart`
- `apps/driver/lib/src/features/profile/presentation/driver_notifications_screen.dart`
- `apps/driver/lib/src/features/profile/presentation/driver_privacy_screen.dart`
- `apps/driver/lib/src/features/profile/presentation/driver_ranking_benefits_screen.dart`
- `apps/driver/lib/src/features/profile/presentation/driver_ride_summary_screen.dart`
- `apps/driver/lib/src/features/profile/presentation/driver_security_screen.dart`
- `apps/driver/lib/src/features/profile/presentation/driver_settings_screen.dart`
- `apps/driver/lib/src/features/profile/presentation/driver_support_screen.dart`
- `apps/driver/lib/src/features/profile/presentation/driver_terms_screen.dart`
- `apps/passenger/lib/src/core/auth/passenger_auth_screen.dart`
- `apps/passenger/lib/src/features/guide/presentation/local_guide_screen.dart`
- `apps/passenger/lib/src/features/home/presentation/destination_search_screen.dart`
- `apps/passenger/lib/src/features/home/presentation/passenger_home_screen.dart`
- `apps/passenger/lib/src/features/home/presentation/vehicle_selection_screen.dart`
- `apps/passenger/lib/src/features/payments/presentation/card_checkout_screen.dart`
- `apps/passenger/lib/src/features/payments/presentation/passenger_coupons_screen.dart`
- `apps/passenger/lib/src/features/payments/presentation/passenger_wallet_screen.dart`
- `apps/passenger/lib/src/features/payments/presentation/ride_payment_screen.dart`
- `apps/passenger/lib/src/features/payments/presentation/web_card_entry_screen.dart`
- `apps/passenger/lib/src/features/profile/presentation/passenger_benefits_screen.dart`
- `apps/passenger/lib/src/features/profile/presentation/passenger_help_screen.dart`
- `apps/passenger/lib/src/features/profile/presentation/passenger_notifications_screen.dart`
- `apps/passenger/lib/src/features/profile/presentation/passenger_privacy_screen.dart`
- `apps/passenger/lib/src/features/profile/presentation/passenger_profile_screen.dart`
- `apps/passenger/lib/src/features/profile/presentation/passenger_ride_history_screen.dart`
- `apps/passenger/lib/src/features/profile/presentation/passenger_saved_places_screen.dart`
- `apps/passenger/lib/src/features/profile/presentation/passenger_security_screen.dart`
- `apps/passenger/lib/src/features/profile/presentation/passenger_settings_screen.dart`
- `apps/passenger/lib/src/features/profile/presentation/passenger_support_screen.dart`
- `apps/passenger/lib/src/features/profile/presentation/saved_place_pin_screen.dart`
- `apps/passenger/lib/src/features/rides/presentation/passenger_activity_screen.dart`
- `apps/passenger/lib/src/features/rides/presentation/passenger_ride_chat_screen.dart`
- `apps/passenger/lib/src/features/rides/presentation/resumed_ride_screen.dart`
- `apps/passenger/lib/src/features/rides/presentation/ride_tracking_screen.dart`
- `apps/passenger/lib/src/features/tours/presentation/agency_tours_screen.dart`
