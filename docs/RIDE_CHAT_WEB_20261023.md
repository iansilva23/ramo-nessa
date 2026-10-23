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

## Conferência da VPS antes da instalação

O arquivo `deploy/staging/inspect-ride-chat-web.mjs` consulta somente IDs de imagens, assinaturas de código e arquivos públicos e os dois mounts relevantes do Gateway. Não consulta dados de usuários, credenciais ou ambiente, não altera SQL e não reinicia serviços. Sua saída permite comparar a instalação ativa antes de montar o pacote compatível.

Código da funcionalidade validado em `75ca2b7c3d9a97cfaa6f48a3748c2f12867a19f1`. A inspeção está nesse mesmo commit; SHA-256 do arquivo: `3578bd95830bd05923834f9fb1e3dd71e6c94ff66380915d4e2521f6106b4bdd`.

A validação é de implementação: os builds desta revisão usam `https://example.invalid` e não são pacotes para instalar. O pacote configurado e o instalador devem ser produzidos após comparar as versões realmente ativas.

## Evidência concluída

[Workflow 39999319953](https://github.com/iansilva23/ramo-nessa/actions/runs/39999319953), commit `75ca2b7c3d9a97cfaa6f48a3748c2f12867a19f1`, conclusão **success**:

- Core: typecheck, build, 870 testes aprovados, 11 condicionais ignorados; migração 089 aplicada e segunda aplicação idempotente. Inclui teste real PostgreSQL de persistência, destinatários e paginação com horários iguais, além do handler HTTP com autorização, contato e concorrência.
- Motorista: análise sem problemas, 120 testes aprovados e build Web concluído. O teste de 320 px confirma número, URL correta do WhatsApp, ausência de overflow e confirmação somente das mensagens recebidas.
- Passageiro: análise sem problemas, 229 testes aprovados e build Web concluído.
- Componente compartilhado: análise sem problemas e dois testes aprovados em cada job, incluindo falha de rede no contador e leitura em primeiro plano ao retomar a aplicação.

Nenhum desses passos acessou ou publicou na VPS. Nenhum build móvel foi distribuído.
