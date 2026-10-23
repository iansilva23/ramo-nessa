# Chat Web: mensagens não lidas e contato do passageiro

Base: `ops/driver-ride-redesign-web-20261023` (7fd822356f84c435d28c0c43b2bcbf585e306710).
Implementação isolada para revisão. Não publica na VPS, não mescla na main e não distribui Android/iOS.

- Contador vermelho nos botões do chat do passageiro, nos cartões do motorista e no retângulo minimizado. Atualiza a cada quatro segundos, ao retomar a aba e ao montar o botão.
- Recebimentos de leitura persistentes por mensagem e destinatário. Buscar mensagens não marca leitura. Somente bolhas recebidas visíveis na conversa atual e em primeiro plano são confirmadas; erros de rede mantêm o contador anterior.
- Histórico anterior em páginas de cem, para também permitir ler mensagens antigas sem perder a contagem.
- `GET .../messages/status` devolve quantidade não lida. Somente o motorista atribuído à corrida ativa recebe `passengerWhatsApp`; o passageiro e o histórico concluído não recebem esse campo de contato.
- `POST .../messages/read` aceita até cem IDs e ignora mensagens próprias ou de outra corrida; reenvios são idempotentes. Novas mensagens que chegam durante a leitura continuam não lidas.
- O cadastro já exige celular brasileiro e código enviado pelo WhatsApp. Esse mesmo número confirmado é reutilizado no contato, sem um segundo telefone. A interface passa a identificar explicitamente “WhatsApp obrigatório”. Novas solicitações sem número válido são recusadas pelo Core com orientação para completar a conta. Corridas existentes, pagamentos e recuperação continuam acessíveis.
- Migração aditiva 089: somente tabela de leitura. Nenhuma alteração financeira, de preços, provedores ou dados existentes. Mensagens anteriores começam como não lidas.

## Publicação posterior

A versão atualmente instalada foi atualizada somente no Motorista Web. Este recurso também modifica Passageiro Web e Core e precisa da migração 089. Não usar o instalador antigo somente do Motorista para este pacote.

Antes de preparar a instalação, comparar o código/imagem do Core e o Passageiro realmente ativos na VPS com esta base; preservar as correções de checkout, pagamento, ambiente e credenciais existentes. Fazer backup com restauração ensaiada e preparar retorno dos serviços. O pacote desta revisão não autoriza substituir serviços por uma base mais antiga.

Os fontes Flutter são compartilhados, mas esta revisão compila apenas Web e não publica versões móveis. O Core compartilhado continua aceitando os endpoints anteriores de mensagens para as versões existentes.
