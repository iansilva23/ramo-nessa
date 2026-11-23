# Ramo Nessa V5 — Plano de integração e homologação do motor de preços

Status: **DRAFT de desenvolvimento. Não publicado.**
Escopo: preservar o catálogo publicado #8, credenciais, Web GIF, Core, Postgres, ADM e pagamentos enquanto as alterações são avaliadas.

## Linha de integração sequencial (não mesclar aleatoriamente)
1. **PR #29 — fix/pricing-route-eligibility-20261018**: reparo dos transfers por localidade e interface de cotação válida. Esta revisão já foi publicada somente na homologação anterior.
2. **PR #30 — feature/regional-distance-fares-20261018**: fallback por km somente quando há regras de categoria/localidade publicadas, preço fixo tem prioridade, km limite e valores noturnos.
3. **PR #31 — feature/pricing-admin-complete-20261018**: tabela pesquisável de preços e controles de adicionais noturnos; Comfort por localidade editável sem sobrescrever tarifas existentes.
4. **PR #32 — feature/municipality-operating-boundary-20261018**: município diferente de região de preços, fontes para cada atribuição, segurança do novo fallback regional e editor em rascunho. O HEAD deste PR contém os três anteriores em sequência.

**Não fazer merge direto em main.** Revisar diff final e obter homologação da única branch candidata, mantendo DRAFT até evidências.

## Regras comerciais e geográficas
- Municípios de operação local do lançamento: Cruz e Jijoca de Jericoacoara.
- Três áreas tarifárias continuam independentes: Preá (Cruz), Jijoca (sede) e Vila Jeri (ambas em Jijoca).
- Buggy na Vila e regras de circulação diferenciadas; Carro popular não entra na Vila.
- Demais municípios são destinos externos; tarifas longas já aprovadas não podem ser apagadas por mera reclassificação municipal.
- Taxímetro local, mototáxi e transfer externo devem ser elegibilidades separadas na camada de oferta/dispatch. **A fronteira operacional final ainda precisa ser aplicada e comprovada no fluxo real de corrida**, não apenas no catálogo de preço.
- Nomes ambíguos e geocercas insuficientes precisam de coordenadas e município verificados antes de serem ativados em novas regras automáticas.
- Nenhuma tarifa/km regional deve entrar em vigor sem valores comercialmente aprovados pelo proprietário; nenhum mínimo, máximo, passageiro extra, adicional noturno ou taxa pode ser preenchido por estimativa de documentação.

## Critérios obrigatórios de aceite
- Banco: backup íntegro, hash do catálogo comercial em vigor, todas as versões e possibilidade de rollback sem migração destrutiva.
- Mapas: cruzar origem/destino com município, região operacional, localidade, raio/geocerca e prova GPS; evitar localityId vindo só do texto livre.
- Preços: para cada categoria `moto`, `car`, `comfort_black`, `buggy`, `delivery`, testar day/after_22, ida/volta, passageiro extra, Km, minimum, max, limites e ausências.
- Caminhos prioritários: Preá ↔ Cavalo Bravo; Vila Preá ↔ Cavalo Bravo; Jijoca ↔ interiores; Preá ↔ Jeri; Jijoca ↔ Jeri; Preá/Jijoca ↔ JJD; Barrinha de Baixo em Acaraú; destinos externos com transfer aprovado; categoria não autorizada (422).
- Prioridade: preço fixo por rota > preço local aprovado > tarifa regional por km **explicitamente publicada**; não liberar categoria sem preço final exato pagável.
- Interface: mostrar no Passageiro exatamente as categorias elegíveis, os valores aprovados e desativar Continuar quando não houver cotação exata; motor de pagamento deve conferir versão/valor assinado.
- ADM: criar rascunho, ajustar TODAS as tarifas, valores diurnos e noturnos, adicionais por região/categoria, km e município com evidência; revisar diferenças antes de publicar; bloqueio otimista para edição concorrente.
- Regressão: manter Core, APIs, Apps Android/iOS/Web navegador, motorista e seu ciclo, Mercado Pago, Asaas repasses, OTP/FCM e mapa. Não reintroduzir convite de instalação PWA nem quebrar GIFs.
- Segurança: homologar histórico/auditoria de quem alterou preço e regra, testar autenticação e autorização ADM, limites, números inválidos, fraude GPS, precisão de rota e race conditions.
- Publicação: primeiro ambiente isolado, smoke tests Core+Gateway+ADM; depois aceite manual do proprietário com capturas de tela e provas; somente após isso avaliar produção.
- Rollback: manter imagem Core anterior, bundles Web+ADM anteriores, export imutável do catálogo, Compose overlays/volumes/segredos inalterados; plano de voltar em minutos.

## Dependências / riscos em aberto
1. **26 atribuições geográficas pendentes** no inventário estático, inclusive hotéis e comunidades transfronteiriças; não inventar município.
2. Parte das localidades não tem geocerca válida: não supor que pertencer a uma tabela implica pertencimento à área de operação.
3. A política de preço regional por km ainda não tem os parâmetros comerciais aprovados; ficará inativa onde nenhum conjunto foi cadastrado.
4. Modalidade `delivery` tem regra regional própria e não pode obter permissão automática para cruzar qualquer município.
5. Tarifas antigas de destinos externos exigem separar categoria/rota de **transfer aprovado** versus corrida local antes de impor bloqueios globais.
6. Se o navegador aceitar cotação por distância com km roteado, testar contra dados reais Google Maps e falhas de provedor; se km inválido, não cotar.
7. O painel de tarifação V5 deve apresentar corretamente status de preço manual, automático, faixa e noturno para evitar induzir alterações sobre valor derivado.

## Política de conclusão
CI verde é necessário, porém não suficiente. Nenhum passo está concluído sem teste visual, teste real de cotação por rota, auditoria de regulação e autorização explícita para publicação.

## Revisão consolidada do ADM no PR #35 — 20/10/2026

A área `Rascunhos e publicações` foi integrada ao roteamento existente, com cliente autenticado, visão da versão vigente, comparação de tarifas e histórico. A publicação e a exclusão continuam vinculadas ao controle de concorrência e às permissões do Core. A edição de preços e de localidades permanece nas telas originais; seus atalhos apontam para a central.

A proteção de publicação sem diferenças foi reforçada tanto na disponibilidade do botão quanto no manipulador da ação. Essa defesa de interface **não substitui** a validação autoritativa do Core.

**Critérios ainda não encerrados:** validação visual manual em aparelhos reais; aceite comercial de tarifas; inventário das 26 atribuições municipais pendentes; limites de operação no dispatch real; integração de produção e rollback controlado. Um CI verde não aprova automaticamente estes critérios. Nenhuma dessas aprovações pode ser inferida dos testes automatizados.

**Restrições:** manter o PR #35 em DRAFT; não publicar, não mesclar e não alterar VPS, financeiro, credenciais, tarifas reais ou o card protegido do Passageiro.

## Fechamento de evidências automatizadas — 20/10/2026, PR #35

**HEAD verificado:** `6f77b9883f75f1f3d6611af5d0f6f3e8b0265d19`.
**CI verificado:** [39443879723](https://github.com/iansilva23/ramo-nessa/actions/runs/39443879723), 7/7 jobs com sucesso (Core, PostgreSQL 16 descartável, ADM regressão, Chromium, Flutter passageiro, motorista e design system).

### Casos cobertos por testes do Core (simulação, sem tráfego real)
- Classificação de GPS e validação de geocerca, coordenadas e identificadores inválidos.
- Matriz de 160 combinações de 4 referências geográficas × 4 destinos × 5 categorias × 2 períodos, com distância sintética; não reproduz uma rota real.
- Elegibilidade 4x4 no corredor da Vila e aplicação do snapshot da corrida na seleção de motoristas.
- Bloqueio de motorista offline/ocupado/com reserva de outra corrida/GPS desatualizado/capacidade ou categoria incompatíveis.
- Despacho apenas quando estado da corrida e status do pagamento permitem; estados simulados de aceite, busca, cancelamento, nova tentativa, reembolso e conclusão.
- **Não foram executados** pagamentos, reembolsos ou despachos de produção.

### Fronteira de aceite — o que falta comprovar fora dos testes
1. **Fluxo end-to-end real em ambiente de homologação isolada:** Apps Passageiro/Motorista ↔ Gateway ↔ Core ↔ banco, cotação exibida/assinada/paga, confirmação e oferta com reserva de 35s, cancelamentos e atualização de estado. Testes unitários de máquina de estados não substituem isso.
2. **Geografia/Google Maps:** GPS em aparelho, distância de rota em ida e volta, precisão e geocercas, roteamento indisponível e consistência da zona tarifária. Não disparar chamadas pagas sem autorização.
3. **Comercial/municípios:** reconciliar diferenças de preços fixos, parâmetros/km ainda não aprovados e 26 atribuições de localidade municipais pendentes. Não publicar tarifa nem habilitar município por inferência.
4. **Segurança/financeiro:** assinatura/versão do preço, idempotência e conciliação de pagamentos e reembolsos com fornecedores em sandbox próprio quando permitido; não alterar integrações existentes.
5. **Aceite visual e operação:** verificações manuais Android/iOS/Web/ADM, papéis administrativos e evidências de backup/rollback antes de qualquer proposta de deploy.

**Decisão:** concluir a fase de regressão automatizada atual como aprovada para o HEAD informado, sem reabrir o ADM por cosmética. A fase de homologação operacional **NÃO está encerrada**. Manter PR #35 DRAFT, sem merge, VPS ou publicação.

## REGRA MESTRE — EXECUÇÃO EM BLOCOS COMPLETOS (20/10/2026)

**Regra obrigatória para toda continuidade do Ramo Nessa V5: trabalhar por blocos técnicos completos, não por um único teste ou commit a cada solicitação de “continue”.**

1. Antes de editar, verificar HEAD, PR, CI, escopo protegido, dependências e regressões relacionadas.
2. Organizar cada execução em um bloco substancial de funcionalidades e validações interdependentes, agrupando alterações, correções e testes; evitar commits meramente incrementais ou cosméticos que não tragam progresso real.
3. Corrigir erros detectados na mesma execução, quando tecnicamente possível, e verificar o CI do HEAD resultante. Se o CI estiver pendente, relatar explicitamente, sem fingir aprovação.
4. Preservar tudo que já foi aprovado, sem recriar ou sobrescrever código existente, sem alterar tarifas comerciais, financeiro, providers, infraestrutura, credenciais, card protegido do passageiro ou outras áreas fora do escopo.
5. Não fazer merge, publicação, deploy ou alteração de VPS. Manter PR #35 DRAFT até gates de homologação e autorização explícita.
6. Ao finalizar um bloco, entregar **um relatório consolidado** com evidências, testes aprovados/falhos, commits e pendências reais. Medir progresso por critérios encerrados, não pela quantidade de commits.
7. Priorizar integração ponta a ponta e bloqueios reais de lançamento, em vez de acrescentar regressões triviais sem necessidade.
8. Não exigir do proprietário dezenas de mensagens de continuação para microtarefas; trabalhar o máximo possível no mesmo turno, reconhecendo que não existe execução autônoma em segundo plano após a resposta.

**Aplicação imediata:** a falha do workflow #39449389550 foi uma expectativa equivocada do teste: a API já emite `DRIVER_HOLD_EXPIRED` para pagamento com reserva expirada, mantendo o bloqueio correto. Corrigir o teste sem trocar a semântica de negócio.
