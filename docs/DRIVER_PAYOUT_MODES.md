# Repasses dos motoristas

O ADM oferece três modos, em Financeiro → Controle de repasses:

- **Manual** (padrão): selecionar motoristas reserva o saldo disponível integral, sem taxa e sem mínimo. O proprietário faz o Pix pelo banco e confirma cada pagamento no ADM, informando método e referência do comprovante. Preparar o lote não transfere dinheiro.
- **Semiautomático**: após configurar e homologar um provedor de repasses, o proprietário seleciona os motoristas e confirma o envio pela API.
- **Automático**: após configuração e ativação explícita, o servidor cria ciclos segunda, quarta e sexta às 07:00 no horário de Fortaleza. Começa desligado.

Antecipações solicitadas pelo motorista continuam separadas: aprovação do proprietário, pagamento externo manual e registro do comprovante. Aprovar não envia Pix. As regras atuais de mínimo e taxa de antecipação não se aplicam aos repasses normais.

A reserva guarda o canal de execução. Uma reserva manual nunca é enviada pelo worker de API, mesmo que a política seja alterada posteriormente. Repasses já enviados por API continuam sendo conciliados. A referência do comprovante é obrigatória para registrar pagamentos manuais.

## Asaas pendente

A conta Asaas ainda aguarda aprovação. O ADM apresenta o espaço e o estado da integração, mas esta entrega **não inclui um adaptador Asaas nem envio real pela Asaas**. Depois da aprovação será necessário implementar/homologar o adaptador `DriverPayoutProvider`, configurar a credencial privada no servidor e validar criação, consulta, falhas e idempotência. Apenas inserir uma chave não conclui essa integração. Não há campo de segredo no navegador.

O recebimento dos passageiros pelo Mercado Pago permanece no fluxo existente. Não há novos repasses reais nesta entrega.

A migration 081 desliga os ciclos ao atualizar, mantém pendências externas como manuais e conserva a conciliação de repasses já em processamento com identificador do provedor.
