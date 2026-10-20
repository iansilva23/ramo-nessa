# Homologação — Regiões e preços

## Entrega e limites
A gestão nova substitui a navegação fragmentada por uma única área com quatro abas. O motor continua autoritativo no Core e usa o mesmo histórico de catálogos.
Precedência: tarifa fixa válida → regra por quilômetro válida → indisponível.
Não há valores comerciais previamente carregados no catálogo preparado. Valores encontrados em testes e capturas são exclusivamente sintéticos.

Esta branch não publica serviços. Ela não executou limpeza, migração de dados reais, repasses ou cobranças. O catálogo legado permanece efetivo até preparação e rollout especificamente autorizados.

## Preparação do catálogo
O script backend/core/scripts/prepare-regions-catalog.ts é uma ferramenta operacional separada das migrations.
- --plan ARQUIVO: somente leitura; exporta snapshot anterior, referência imutável, digest e inventário de dependências. Arquivo exclusivo 0600 em pasta privada.
- --apply-plan ARQUIVO: só aceita checksum SHA-256 do plano conferido e --confirm three-regions-empty-fares-20261020. Exige proprietário humano ativo e configuração original inalterada.
- Uma única transação cria snapshot com Jeri, Jijoca (sede) e Preá, mantém categorias e remove tarifas operacionais. Nenhuma tabela financeira ou corrida é apagada.
- Reexecução reconhece o identificador da preparação e não apaga tarifas cadastradas posteriormente.
- --restore-plan ARQUIVO: exige checksum, revisão atual explícita e --confirm RESTORE_PRICING_CATALOG. Restaura a configuração anterior como nova versão; mantém todo o histórico intermediário.
- A aplicação e a restauração dependem de autorização do proprietário e de inventário/backup atual do ambiente. Não executar por inferência a partir deste documento.

O plano de catálogo não substitui backup integral do PostgreSQL e material de retorno das imagens/Gateway. Não há rollback automático de banco.

## Funcionalidade a homologar no ambiente autorizado
1. Conferir a área Regiões e preços no ADM, com três regiões e zero tarifas após a preparação aprovada.
2. Criar região pelo mapa, pesquisar local, definir município/estado e raio, selecionar categorias e salvar.
3. Cadastrar tarifa fixa e por km para a mesma rota/categoria; conferir prioridade da fixa.
4. Conferir dias/noites sem fallback automático. Um período não configurado permanece indisponível.
5. Comparar cotação Web e preparação de corrida com distância Google real. Testes de CI usam provider sintético.
6. Confirmar categoria sem motorista compatível, nenhuma tarifa, região arquivada e limites sobrepostos.
7. Alterar tarifa ativa com senha/MFA; validar dois administradores e tentativa de edição desatualizada.
8. Validar reserva/oferta/aceite/pagamento em sandbox autorizado, cancelamento e reembolso, sem repasse real.
9. Aceitar interface no Safari de iPhone e Chrome de Android, além de computador/tablet. Playwright WebKit não equivale a iPhone real.
10. Somente após aceite Web, planejar sincronização e testes nativos; nenhum APK/IPA é atualizado nesta fase.

## Categorias
Os cinco adapters operacionais existentes são preservados. Nome/descrição/ícone das categorias suportadas são consumidos pela versão Web.
Novos IDs podem ser cadastrados desativados. O servidor rejeita sua ativação enquanto não houver adapter de operação e suporte real dos aplicativos/veículos/motoristas. Não se afirma suporte irrestrito a tipos novos.
O requisito 4x4 para carros em Jericoacoara é preservado e validado no servidor.
Tarifas são associadas a regiões circulares; um ponto específico pode ser representado por uma cobertura pequena, com raio mínimo de 50 metros.

## Evidências
A execução do workflow Regions and Pricing - Web Review verifica:
- Core: tipagem, testes e build, com guardas de integridade financeira/nativa.
- ADM: sintaxe, testes de API, moeda, navegação e integridade.
- PostgreSQL 16 descartável: exclusividade de gravação, auditoria atômica, histórico, conflito e rollback por falha.
- Web Passageiro/Motorista: análise, testes e compilação; teste específico do catálogo em Chrome.
- Chromium/WebKit: controlador real, API HTTP, autenticação/senha/MFA, assistente, tarifa, simulação, arquivamento/recuperação e overflow em 1440/860/390 px.
As capturas usam dados sintéticos e tiles substituídos. Não comprovam Google Maps, GPS ou provedores reais. Bundles de revisão apontam para example.invalid e não são pacotes conectados à VPS.

## Limites de implantação e aceite real
- A revisão efetivamente ativa no Gateway/VPS e o inventário do banco real não foram verificados nesta sessão. Conferir imagens, revisão, catálogo efetivo e dependências antes de aplicar o plano.
- Android/iOS não foram compilados, atualizados ou testados em aparelhos. Os diretórios nativos e o comportamento legado permanecem preservados nesta branch.
- Clientes nativos já instalados não foram homologados com managedOperations. Esse modo exige coordenadas e sessão na cotação. Não ativar em backend de produção compartilhado sem definir e validar a compatibilidade dos clientes existentes após o aceite Web.
- A navegação/login completos do ADM não fazem parte do harness de navegador: ele monta o controlador real no shell existente com sessões sintéticas. Rotas e aliases são verificados também pela suíte de navegação do ADM.
- O teste financeiro compara o valor da cotação, da reserva e do registro de pagamento no serviço real com repositórios isolados. Não comprova autorização, liquidação, webhook, cancelamento ou reembolso de um provedor externo.
- Nenhuma categoria nova arbitrária está liberada para uso: novos IDs ficam desativados até implementação e homologação de seu adapter e requisitos de operação.

## Resultado registrado — 20/10/2026
Código verificado: `2b845898351aa4ca88a941098a724fcf7e5640b2`.
Execução: [GitHub Actions 39480460591](https://github.com/iansilva23/ramo-nessa/actions/runs/39480460591).

| Verificação | Resultado |
| --- | --- |
| Core: tipagem, build e suíte | 774 passaram, 0 falharam, 51 ignorados por guardas de ambiente |
| ADM: sintaxe e suíte | 163 passaram, 0 falharam |
| PostgreSQL 16: duas integrações isoladas | 2 passaram, 0 falharam, 0 ignorados |
| Web Passageiro | Análise, 184 testes, 2 testes em Chrome e build aprovados |
| Web Motorista | Análise, 108 testes e build aprovados |
| Chromium e WebKit | Fluxos descritos acima aprovados nos dois navegadores |
| Revisão visual | Capturas examinadas em 1200, 860 e 390 px; screenshots adicionais em 1440 px |
| Integridade | Providers financeiros, ledger, migrations, projetos nativos e ride_bottom_sheet preservados contra a base #35 |

Os 51 testes ignorados na suíte geral não são aprovação: permanecem dependentes de seus ambientes próprios. O job PostgreSQL executa especificamente a integração transacional nova e a regressão V5 financeira existente, não todos os testes PostgreSQL do repositório.
Os artefatos da execução incluem as capturas `regions-pricing-browser-evidence` e os dois bundles Web, sujeitos à retenção do GitHub Actions.
