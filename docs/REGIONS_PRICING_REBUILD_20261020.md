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
- Terminal local indisponível nesta sessão. Validações executáveis foram realizadas nos runners isolados do GitHub Actions; testes em dispositivos reais continuam separados.
- A imagem efetivamente ativa no Gateway/VPS e o banco real não foram acessados nesta sessão. A base #35 identifica o código auditado, não comprova qual revisão está implantada. O inventário real de dependências permanece obrigatório antes de qualquer limpeza.
- O GitHub retornou visibility=public. Nenhuma alteração de visibilidade foi efetuada.

## Implementação
O modo explícito managedOperations substitui os caminhos de cálculo antigos somente em um catálogo preparado. Snapshots históricos continuam interpretáveis.
Salvar cria uma versão imutável e uma auditoria na mesma transação PostgreSQL. Revisão otimista impede sobrescrita de edição concorrente. Não há rascunho/publicação separados no fluxo novo.
Exclusões arquivam registros e desativam tarifas dependentes atomicamente. Senha + MFA novo são conferidos no servidor, usando criptografia, contador TOTP e limites persistentes existentes.
Categorias sem adapter operacional real não podem ser ativadas. Os cinco tipos atuais mantêm operação e compatibilidade de veículos; futuras categorias podem ser cadastradas desativadas.
A limpeza para três regiões/zero tarifas foi preparada em ferramenta operacional separada e testada. Não está em migrations automáticas e não foi executada em ambiente real.

## Problemas corrigidos e preservação
- O cadastro deixou de exigir gestão manual de rascunhos e publicações: o salvamento direto cria histórico e auditoria no servidor.
- Valores e distâncias fornecidos pelo cliente não autorizam cobrança. Rotas por km são consultadas no servidor; a tarifa fixa não exige consulta de distância.
- A compensação de deslocamento legada não acrescenta cobrança ao catálogo novo. Um teste compara cotação, reserva e pagamento.
- O endpoint de cotação com rota exige sessão de passageiro e limite persistente por conta, evitando acesso anônimo ao provedor pago.
- Coberturas novas atualizam também os limites de pesquisa de lugares e a classificação Web. Não dependem do retângulo geográfico antigo.
- O novo modo é opt-in por snapshot: não reinterpreta preços de corridas antigas nem modifica providers, ledger, migrations ou projetos Android/iOS.
- A branch do #35 e a main permanecem nos SHAs auditados. O #36 aponta para a branch de integração, sem merge.

## Referências de experiência
Consulta em 20/10/2026 às fontes oficiais:
- [Uber: preço antecipado](https://www.uber.com/us/en/marketplace/pricing/upfront-pricing/) descreve preço exibido antes da solicitação, com tempo/distância estimados e demanda.
- [Lyft: preços e cobranças](https://help.lyft.com/hc/en-us/all/articles/115012925707) descreve preço antecipado e possíveis diferenças quando a viagem muda.

A decisão para o Ramo Nessa mantém o modelo solicitado: fixa → km → indisponível. Não foram introduzidos multiplicadores de demanda, preço por minuto ou taxas dessas empresas. As fontes são referências públicas da experiência, não acesso aos algoritmos privados.

## Aceite e evidências
Ver [REGIONS_PRICING_HOMOLOGATION.md](REGIONS_PRICING_HOMOLOGATION.md) para execução reproduzível, evidências e restrições.
A entrega é candidata à homologação Web em ambiente autorizado. Não é uma declaração de aprovação de produção ou teste em aparelhos reais.
Categorias novas sem adapter operacional permanecem desativadas; o suporte irrestrito a novos tipos continua pendente.

