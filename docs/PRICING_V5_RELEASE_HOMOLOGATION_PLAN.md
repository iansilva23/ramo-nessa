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
