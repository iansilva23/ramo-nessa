# Regiões e Preços — reconstrução Web

Base imutável auditada: PR #35, 6f90c616ec181943d093b0e373e21fdb23b57f4f.
Branch: feature/admin-regions-pricing-simple-20261020. Sem merge ou deploy autorizado.

## Decisão comercial preservada
Tarifa fixa válida para categoria/rota/período tem precedência. Sem fixa, usa regra por quilômetro e distância roteada no servidor. Sem regra, opção indisponível.
Nenhum valor comercial é introduzido. Asaas, Mercado Pago, ledger, repasses e histórico de corridas permanecem preservados.

## Auditoria
- A main está em 535de40e4c2633881993ec163aee2fce35bb7fe3, anterior aos trabalhos recentes.
- #35 integra Core/ADM sobre a base financeira. Sua descrição no GitHub está desatualizada; arquivos e commits foram conferidos.
- Há valores e regras especiais nas tabelas estáticas, delivery, Buggy, Comfort e transfer. Limpar só tabelas não impede cobranças antigas.
- O catálogo versionado existente já preserva snapshots de corridas; a nova gestão reutiliza a mesma persistência e o mesmo quoteFare.
- Raio sobreposto segue menor raio, distância proporcional ao centro e identificador estável, conforme o classificador existente.
- Terminal local indisponível nesta sessão. Validações executáveis serão registradas pelos workflows; testes em dispositivos reais continuam separados.
- O GitHub retornou visibility=public. Nenhuma alteração de visibilidade foi efetuada.

## Implementação
O modo explícito managedOperations substitui os caminhos de cálculo antigos somente em um catálogo preparado. Snapshots históricos continuam interpretáveis.
Salvar cria uma versão imutável e uma auditoria na mesma transação PostgreSQL. Revisão otimista impede sobrescrita de edição concorrente. Não há rascunho/publicação separados no fluxo novo.
Exclusões arquivam registros e desativam tarifas dependentes atomicamente. Senha + MFA novo são conferidos no servidor, usando criptografia, contador TOTP e limites persistentes existentes.
Categorias sem adapter operacional real não podem ser ativadas. Os cinco tipos atuais mantêm operação e compatibilidade de veículos; futuras categorias podem ser cadastradas desativadas.
A limpeza para três regiões/zero tarifas será preparada separadamente. Não está em migrations automáticas e não foi executada em ambiente real.

## Aceite
Este documento será atualizado com resultados concretos do CI e limites antes da entrega.
