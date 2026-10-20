# Ajuda e tutoriais de Regiões e preços

O botão **Ajuda e tutoriais** fica na área existente de Regiões e preços. Não cria outro menu de gestão. Há 18 capítulos com busca sem distinção de acentos/maiúsculas, instruções de cadastro, definição dos campos, limites, consequências nos aplicativos, dependências, segurança e solução de erros.

Os botões **?** dos campos e opções abrem o capítulo correspondente. Cabeçalhos dos editores, simulação, exclusão, mapa, horários e histórico também dão acesso à ajuda. A ajuda abre em diálogo acima do formulário atual: Escape ou Voltar ao painel fecha somente o manual e devolve o foco. A navegação deve manter os valores ainda não salvos.

## Conteúdo e limites documentados
- Região, município/UF, busca, centro, raio, teclado, sobreposições e validação das duas pontas.
- Quatro passos do assistente, categorias permitidas e tarifa opcional salva com a região.
- Categorias existentes, capacidade, requisito 4x4 e novos tipos que permanecem desativados sem suporte operacional.
- Direção/ida e volta, períodos, preço fixo, km por rota do servidor, mínimo, passageiros e adicionais.
- Adicionais são valores fixos por período; nomear uma cobrança não cria gatilho de bagagem/espera/evento.
- Simulação usa centros e não comprova oferta de motorista, pagamento ou todos os pontos das coberturas.
- Salvamento direto, confirmação no servidor, MFA novo, conflito de revisão e resposta de conexão incerta.
- Exclusão por arquivamento, dependências desativadas, restauração desativada e preservação de histórico.
- Lista de histórico limitada às versões retornadas; sem prometer botão de recuperação integral inexistente.
- Web primeiro; aceite conectado, provedores e aparelhos reais continuam sendo verificações distintas.

Os exemplos não preenchem preços e não criam tarifas. A leitura não chama APIs, não acessa credenciais, não persiste buscas e não altera permissões. Nenhum código do Core, pagamentos, migração de banco ou aplicativo móvel é alterado por esta entrega.

## Manutenção
Conteúdo em `apps/admin/src/help/regions-pricing-guide.js`. Cada capítulo declara arquivos de referência para revisão técnica; essas referências não são expostas ao administrador. Alterar a semântica de um campo exige revisar o capítulo e o vínculo em `helpTopicForLabel` / `helpTopicForCheck`.

Os testes verificam busca no conteúdo completo, ligações válidas, cobertura dos campos e opções do editor. O ensaio Chromium/WebKit está integrado ao fluxo existente de gestão: navegação, busca, ausência de chamadas de API, entrada como leitor, foco/Escape, preservação de formulário e confirmação MFA, além de capturas em 1440/860/390 px.

Esta alteração precisa de uma atualização do ADM na homologação para aparecer no painel instalado. Não exige novo reset do catálogo nem reconfiguração de preços. A versão implantada anteriormente permanece até essa atualização; não inferir publicação a partir de um commit ou CI aprovado.
