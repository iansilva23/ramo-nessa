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

## Evidências
A execução do workflow Regions and Pricing - Web Review verifica:
- Core: tipagem, testes e build, com guardas de integridade financeira/nativa.
- ADM: sintaxe, testes de API, moeda, navegação e integridade.
- PostgreSQL 16 descartável: exclusividade de gravação, auditoria atômica, histórico, conflito e rollback por falha.
- Web Passageiro/Motorista: análise, testes e compilação; teste específico do catálogo em Chrome.
- Chromium/WebKit: controlador real, API HTTP, autenticação/senha/MFA, assistente, tarifa, simulação, arquivamento/recuperação e overflow em 1440/860/390 px.
As capturas usam dados sintéticos e tiles substituídos. Não comprovam Google Maps, GPS ou provedores reais. Bundles de revisão apontam para example.invalid e não são pacotes conectados à VPS.
