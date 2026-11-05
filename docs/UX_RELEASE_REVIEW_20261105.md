# Revisão de UX e pendências — 05/11/2026

## Escopo e limites

Triagem estática dos 41 arquivos de telas Flutter encontrados no repositório, sendo 26 do Passageiro e 15 do Motorista, e dos 34 módulos JavaScript em apps/admin/src. A leitura e o inventário não equivalem a homologação visual ou funcional completa. Componentes compartilhados podem fornecer proteções de layout que não aparecem diretamente em cada arquivo.

Inspeção visual concluída das capturas de Configurações, Suporte e Notificações dos dois apps. Os cenários incluem largura de 320 px com escala de texto 1,4 e largura de 1000 px em tema escuro. São capturas de testes de widgets com dados simulados, sem envio de mensagens, pagamentos ou chamados reais.

## Implementação e evidências

- PR #103 reúne acesso, feedback de permissões, animações que respeitam movimento reduzido, som original de oferta e seta do Motorista durante IN_PROGRESS.
- PR #104 melhora Configurações dos dois apps, com largura adaptável e tratamento de abertura das configurações do aparelho e orientação no navegador.
- PR #105 melhora Suporte e Notificações, recuperação de falha de carregamento e proteção contra respostas antigas sobrescreverem atualizações do suporte do Motorista.
- Os testes e builds Web, Android debug e iOS simulador da revisão e398076935bde07ee4dd1a3ace5d7839113c1470 passaram no run 42045478880. Isso não comprova builds de distribuição assinados, entrega de push ou desempenho em aparelhos físicos.
- A inspeção final do Passageiro usou os artefatos desse run, recuperados pelo run de auditoria 42064543872.
- Encontrado rótulo truncado no campo de mensagem do Suporte em tela estreita com fonte ampliada. Corrigido para “Mensagem” nos dois apps nos commits a813924ac4e2857ec239240e456d0c1753b31278 e 95542d8e185d953f7cd4fb3a46da02d603d105e6.
- A validação automática da revisão 95542d8e185d953f7cd4fb3a46da02d603d105e6 foi iniciada no run 42065001844. Seu resultado deve ser conferido antes de declarar a correção final validada.

## Pendências confirmadas no código

### Exclusão pelo próprio usuário

As telas passenger_privacy_screen.dart e driver_privacy_screen.dart oferecem “Eliminação de dados” entre as solicitações de privacidade. Os serviços enviam POST /v1/me/privacy/requests. createDataSubjectRequest em backend/core/src/privacy/privacy-service.ts cria um registro com status open. Esse caminho não exclui automaticamente a conta e não implementa a desistência de saldo solicitada pelo responsável.

O ADM possui botão de exclusão definitiva em apps/admin/src/app.js. A existência dele não substitui a implementação de autoexclusão nos aplicativos. Não executar exclusões de usuários reais durante a auditoria.

### Conteúdo legal do Motorista

driver_terms_screen.dart ainda mostra “Rascunho operacional interno — 24/09/2026” e informa que o texto definitivo depende de revisão. A existência da tela e do sistema de documentos legais não comprova a publicação de conteúdo final.

### Documentação de bloqueios desatualizada

docs/RELEASE_BLOCKERS.md ainda afirma que a recuperação de senha foi retirada. Os registros operacionais fornecidos pelo responsável confirmam recuperação por e-mail e WhatsApp ativada e testada. O documento mistura estados históricos com pendências atuais e precisa ser reconciliado com evidências da VPS. Não presumir configuração atual de produção com base apenas nesse arquivo.

## O que permanece aberto

- Redesign visual completo das demais telas dos aplicativos e do ADM. O inventário não é uma entrega desse redesign.
- Revisão de Privacidade, Segurança, Documentos, Carteira, Extrato, históricos, chat, guia, passeios e fluxos completos de corrida e Pix.
- Autoexclusão e página pública de solicitação de exclusão, incluindo regra de saldo aprovada e comunicação ao usuário.
- Aviso e comportamento de localização em segundo plano do Motorista e teste físico online/offline.
- Entrega real de push e toque de nova corrida em Android/iPhone, com app aberto, minimizado e tela bloqueada.
- Medições de desempenho e otimização orientada por resultados em Web, Android, iOS e servidor.
- Homologação física de login, restauração de corrida, GPS, internet fraca, Pix, cancelamentos e estornos.
- Builds oficiais assinados, configuração de lojas, contas de revisão e materiais de publicação.
- Conferência atualizada das exigências oficiais das lojas. Não declarar requisitos atendidos sem pesquisa e validação específica.

## Estado operacional

Os PRs #103, #104 e #105 não representam implantação na VPS ou atualização dos apps instalados. Esta revisão não fez deploy, merge ou publicação em lojas. O ambiente local ficou indisponível, por isso a inspeção utilizou os artefatos do CI.

A última revisão do prompt mestre disponível anteriormente é a versão 43. Não considerar este relatório uma atualização desse arquivo. Este documento preserva os achados atuais no repositório.
