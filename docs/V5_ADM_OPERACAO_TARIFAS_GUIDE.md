# Ramo Nessa V5 — Como alterar preços pelo ADM

**Escopo:** nova central de **Rascunhos e publicações**, implementada no PR #35 (DRAFT). Ainda requer homologação em aparelho, aceites comerciais e implantação autorizada.

## Organização do painel

| Menu | Para que serve |
|---|---|
| **Operação e Tarifas** | Ver todos os preços, filtrar por região/categoria e **editar** tarifas, adicionais e disponibilidade |
| **Nova localidade** | Cadastrar/editar locais, município, pin, raio e categorias sem afetar produção imediatamente |
| **Rascunhos e publicações** | Consultar rascunhos, comparar valores antes/depois, conferir histórico, **publicar ou excluir** |

A navegação é independente: não é preciso procurar o botão “Publicar” dentro de “Nova localidade”. Os editores existentes foram preservados; só sua organização e atalhos foram melhorados.

## Exemplo — alterar um preço

1. Em **Operação e Tarifas → Todos os preços**, localize a rota/categoria e selecione o preço diurno ou noturno a editar.
2. Clique **Começar alterações**, informe o valor e **Salvar no rascunho**. Ainda **não entra em vigor**.
3. Abra **Rascunhos e publicações** pelo menu ou pelo atalho na própria tela. Confira a **versão em vigor**, escolha o rascunho e veja a comparação **Antes / Rascunho** dos valores.
4. Observe também efeitos indiretos: uma alteração em **Carro** pode atualizar automaticamente o valor derivado de **Comfort/Black** se não houver substituição específica.
5. Revise outras áreas indicadas, inclusive permissões, localidades e regras. Confira a autorização comercial; marque a caixa de confirmação.
6. Clique **Publicar agora** e confirme a operação. **O Core, não o navegador, decide se a publicação é permitida.**
7. Novas cotações passam a consultar a versão publicada na respectiva vigência. Os apps não precisam de novo APK só para uma alteração de preços.

## Proteções automáticas

- **Somente leitura:** contas sem `pricing:write` veem versões e comparações, mas não publicam nem excluem.
- **Dois passos:** a confirmação de revisão e o diálogo de publicação são obrigatórios; clicar em editar ou salvar não publica.
- **Concorrência:** se outro operador mudar o rascunho **ou a versão em vigor**, a operação é interrompida até recarregar e revisar.
- **Histórico:** versões publicadas ficam visíveis para consulta. Para mudar um preço novamente, crie novo rascunho.
- **Exclusão:** apagar um rascunho com confirmação não desfaz um catálogo já publicado.
- **Escopo:** o novo painel **não** modifica Financeiro/Asaas, GPS, Google Maps, repasses ou contratos de corrida iniciados.
- **Evidência:** a prova automatizada usa navegador Chromium com dados fictícios e PostgreSQL descartável. Não substitui homologação dos provedores, aparelhos e do servidor real.

## Antes de publicar a primeira vez

- Conferir no ambiente de homologação a versão em vigor e as credenciais do servidor (não colocar segredos no navegador).
- Reconciliar as tarifas da revisão `approved-2026-10-03` com as aprovações comerciais reais. O relatório estático não prova o que está publicado hoje.
- Validar as 26 atribuições municipais pendentes e a divergência Jeri ↔ JJD Comfort R$240 legado x R$220 revisão.
- Confirmar ensaios de GPS, pagamentos **sandbox** autorizados, permissões e backup/rollback. Publicação real requer autorização explícita.

**Regra visual separada:** o card **“Escolha seu destino”** no Passageiro não foi alterado e é protegido por hash no CI do PR #35.
