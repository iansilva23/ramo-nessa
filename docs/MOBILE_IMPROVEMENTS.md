# Localidades, aparência e cadastro de motorista

O editor de Localidades no ADM aceita latitude e longitude digitadas (ponto ou vírgula decimal). **Posicionar alfinete** recentraliza o mapa e mantém o raio, os serviços e as tarifas escolhidos. O mapa usa projeção Mercator, com latitude entre ±85,05112878 e longitude entre ±180. O clique no mapa continua disponível.

Nos aplicativos Passageiro e Motorista, **Configurações → Aparência** oferece Claro, Escuro e Seguir sistema. A escolha é salva no aparelho. As superfícies, textos, marca e mapas seguem o tema; o Android não aplica inversão automática de cores sobre o tema do app.

Somente motoristas precisam de CPF. O servidor normaliza pontuação, valida os dígitos verificadores e exige um vínculo único por motorista. A restrição UNIQUE do PostgreSQL impede duas contas concorrentes com o mesmo CPF, mesmo com números diferentes. O CPF fica em uma tabela privada e não é incluído nas respostas dos perfis. Motoristas antigos fornecem o CPF uma vez no aplicativo atualizado, preservando a situação de aprovação e o veículo. O CPF vinculado não pode ser trocado pelo aplicativo.

A sessão continua salva no armazenamento seguro. Abrir ou retomar o app valida a sessão e renova o prazo no servidor; chamadas autenticadas dos aplicativos também renovam durante o uso. A renovação permite 180 dias de inatividade após o último prolongamento. Sessões expiradas, revogadas ou de contas suspensas continuam bloqueadas. Falha temporária de conexão não apaga o login salvo. Sair da conta revoga a sessão. Desinstalação e restauração de dados seguem o comportamento do armazenamento seguro de cada sistema.

## Atualização e verificação

1. Fazer backup da homologação e atualizar a branch `feature/zone-aware-pricing` para o commit revisado.
2. Executar `sudo node deploy/staging/start.mjs`. Isso aplica a migration `078_driver_cpf.sql` e verifica readiness antes de concluir.
3. Instalar ambos os APKs atualizados sobre as instalações existentes.
4. No ADM, criar/editar uma localidade, aplicar coordenadas negativas e conferir mapa/raio antes de salvar.
5. Em cada aplicativo, trocar a aparência, fechar e abrir para confirmar persistência; conferir mapas e menus em Claro/Escuro.
6. No Motorista, concluir cadastro com CPF válido; uma conta diferente com o mesmo CPF deve receber mensagem de cadastro existente. Passageiro continua sem CPF obrigatório.
7. Em ambos os apps, fechar/reabrir e retornar do segundo plano sem novo login. Depois testar Sair: a sessão antiga deve ser recusada pelo servidor.

Testes automatizados abrangem validação de coordenadas, checksum e concorrência do CPF, restauração e renovação das sessões, revogação, seleção/persistência de aparência e fluxo de coleta de CPF do motorista.
