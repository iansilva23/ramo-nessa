# Candidato consolidado de redesign dos aplicativos

Base: 210ccb00837b543ed223c7b94664f0bba046901e. Inclui os PRs #103 a #109 em uma única linha de código. O ADM e o backend não fazem parte das alterações.

Esta branch é a fonte única da primeira atualização. A validação exige análise, suíte completa, build Web, Android debug e iOS simulador dos dois apps, além da comparação que impede alterações em apps/admin e backend.

O pacote de fonte só é gerado depois da aprovação dos quatro jobs. Não é APK/IPA de distribuição nem bundle configurado para a VPS. Os builds de verificação usam example.invalid e não devem ser instalados como atualização operacional. Os pacotes de publicação precisam conservar a configuração da versão ativa e as assinaturas oficiais. Não houve deploy nesta preparação.

Revisão adicional de estados: código de embarque/coleta com teclado e fonte ampliada; avaliação vazia/registrada/falha; cartão de embarque ativo/bloqueado; cancelamento gratuito, confirmação, dados Pix, aprovação e devolução. Serviços de teste simulados não fazem chamadas reais nem movimentam saldo.

O diálogo de embarque passa a permitir rolagem quando teclado/fonte ampliada reduz a área disponível. As regras de três dígitos, tentativas e retorno do código são preservadas.
