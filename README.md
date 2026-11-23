# Ramo Nessa

Plataforma de mobilidade local para **Jericoacoara, Preá e Jijoca de Jericoacoara**, com aplicativos Flutter para Passageiro e Motorista, painel administrativo e API própria.

> **Software proprietário. Copyright © 2026 Ian Silva. Todos os direitos reservados.**
> Consulte a [licença](https://github.com/iansilva23/ramo-nessa/blob/build/android-sync-20261121/LICENSE) e o [aviso de titularidade](https://github.com/iansilva23/ramo-nessa/blob/build/android-sync-20261121/NOTICE.md).

## Estado do projeto

| Área | Situação em 23/11/2026 |
| --- | --- |
| Plataforma | O Core implementa autenticação, cotação, busca de motoristas, atualização da corrida e pagamentos. O painel administrativo gerencia a operação e as regras comerciais. |
| Web | O Passageiro está disponível no navegador. A versão web já recebeu a atualização da tela de pagamento em dinheiro com opção de troco. |
| Android | Passageiro e Motorista têm builds de homologação. Os pacotes AAB preparados em 23/11 estão sem assinatura de upload. |
| iOS | O projeto tem suporte a builds nativos em Flutter. A validação em iPhone físico e a preparação para distribuição pela App Store seguem pendentes. |

O catálogo do projeto contempla Carro, Mototáxi, Entrega, Buggy e Comfort/Black. A disponibilidade por categoria depende da configuração da operação.

## Código e documentação

A branch padrão `main` contém a base inicial do projeto. A [branch usada na preparação do Android em 21/11](https://github.com/iansilva23/ramo-nessa/tree/build/android-sync-20261121) é uma referência para o código mais recente dos apps e do Core. A versão publicada na web tem seu próprio histórico de releases.

| Diretório | Componente |
| --- | --- |
| `apps/passenger` | Aplicativo do Passageiro |
| `apps/driver` | Aplicativo do Motorista |
| `apps/admin` | Painel administrativo |
| `backend/core` | API e regras de negócio em Node.js e TypeScript |
| `packages/design_system` | Tema e componentes compartilhados |
| `packages/shared` | Modelos e utilitários compartilhados |
| `docs` | Arquitetura, decisões e documentação de publicação |

Consulte o [checklist de publicação](docs/RELEASE_BLOCKERS.md) para acompanhar as pendências de distribuição e homologação.
