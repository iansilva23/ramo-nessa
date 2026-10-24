# Recuperação, embarque e documentos — validação de 24/10/2026

PR #61 permanece em DRAFT. Esta etapa valida código e builds web; não autoriza implantação, ativação do embarque ou publicação Android/iOS.

## Correções desta revisão

- Os testes de reabertura usam armazenamento seguro simulado, sem aguardar chamadas nativas inexistentes no ambiente de testes.
- A recuperação só aceita a ausência de corrida quando a resposta contém explicitamente `ride: null`. Respostas incompletas provocam reconexão, preservando o bloqueio de uma nova solicitação.
- A navegação recuperada é reconstruída quando a consulta de primeiro plano encontra outra corrida, etapa ou pagamento, ou passa a dispor do Pix existente.

## Evidências locais

Ambiente: Flutter 3.47.5, Dart 3.13.4. Mesmo Flutter fixado no workflow.

| Componente | Resultado |
| --- | --- |
| Core: suíte completa, execução sequencial | 840 passaram, 69 condicionais não executados, zero falhas |
| Core: verificação de tipos e build | Passaram |
| ADM: suíte completa | 176 passaram, zero falhas |
| Passageiro: análise e suíte completa | Sem problemas na análise; 244 testes passaram |
| Motorista: análise e suíte completa | Sem problemas na análise; 131 testes passaram |
| Passageiro e Motorista: build web | Passaram com endpoint de validação `https://example.invalid` |

Os testes condicionais de PostgreSQL dependem do ambiente do CI. O resultado local não equivale à execução desses testes. Conferir os checks do commit final do PR.

## Regressões cobertas

- Reabertura com corrida em andamento, retorno ao primeiro plano e reconexão após falha de rede.
- Respostas de recuperação malformadas não liberam o mapa para nova solicitação.
- Consultas repetidas recuperam o mesmo pagamento pendente sem criar outro intent.
- Pix existente volta com o mesmo código copiável; a recuperação usa somente GET.
- Configuração do ADM começa desativada; leitura não ativa o recurso; salvamento explícito mantém categorias e revisão; acesso somente leitura não permite edição ou liberação.
- Liberação pelo suporte envia identificação da corrida e justificativa ao endpoint auditado.
- Código com zero inicial, ocultação para o motorista, cinco tentativas concorrentes persistentes, bloqueio, reinício do serviço, liberação auditada e ativação somente em novas corridas são exercitados no teste PostgreSQL.
- Avisos de vencimento são deduplicados entre trabalhadores concorrentes e reinícios; envio malsucedido permite nova tentativa. A virada do dia usa Fortaleza.
- Vencimento bloqueia novos trabalhos, enquanto a viagem iniciada continua recuperável, pode terminar e liquida uma única vez.

## Limites da validação

O workflow `.github/workflows/ride-recovery-boarding-review.yml` executa migrações duas vezes, testes com PostgreSQL, compilação Core, testes ADM e análise/testes/build web de ambos os apps. O PR deve continuar DRAFT durante a revisão funcional.

Antes de uma publicação futura, validar o ciclo real de pagamento no ambiente de homologação do provedor e o encerramento/reabertura dos apps em aparelhos Android/iOS. Os testes automatizados não representam uma cobrança real, entrega de push em aparelho ou homologação de distribuição móvel.

Nenhuma migração, instalação ou ativação foi realizada na VPS nesta etapa. O interruptor global do código de embarque permanece `false` na criação da política.

## Revisão funcional complementar

O responsável confirmou que o Mercado Pago já está em produção e funcionando nos apps. Não há proposta de reconfiguração dessa integração. A validação complementar trata da recuperação do pagamento existente pela nova versão, sem criar cobranças reais em produção.

- Teste HTTP com sessões emitidas pelo serviço de autenticação: ausência de sessão, papel incorreto, isolamento entre passageiros, consulta repetida ao mesmo pagamento, proteção das rotas de motorista e permissões de leitura/escrita do ADM. Todas as consultas preservam a corrida e o pagamento pendentes.
- Teste de navegador do ADM em largura desktop e móvel: configuração inicialmente desativada, persistência após recarregar, exclusão de Entregas, conflito entre administradores, cancelamento da confirmação pelo suporte, registro da liberação e acesso somente leitura.
- Correção funcional: o suporte recebe uma confirmação explícita de liberação registrada após sucesso; a mensagem não é substituída pelo estado geral da política.
- O teste de navegador executa no CI em Chromium e WebKit e gera capturas em `artifacts/ride-recovery/`, guardadas como artefatos `boarding-admin-*`. A limitação da credencial do terminal para editar workflows foi resolvida usando a conexão integrada do GitHub. O teste HTTP continua dentro da suíte Core.

Resultado local complementar: teste HTTP, Chromium e WebKit passaram; os 176 testes do ADM continuaram passando. O resultado do CI para o commit final é registrado na descrição do PR.

Essa execução usa contas, pagamentos e respostas artificiais, com servidor local temporário. Não representa o encerramento e reabertura dos apps nativos em aparelhos com a nova versão. Essa homologação permanece separada da integração de pagamentos que já funciona em produção.
