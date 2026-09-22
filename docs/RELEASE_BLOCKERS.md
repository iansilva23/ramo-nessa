# Bloqueios atuais de publicação

Este arquivo separa **código implementado** de **prontidão comercial**.

O Ramo Nessa ainda não deve ser publicado como produto final.

## O que já existe

- Passageiro Flutter Android/iOS;
- mapa, GPS, busca, rota, distância e ETA em desenvolvimento;
- Core inicial em Node.js + TypeScript;
- motor comercial v1 e comissão de 10%;
- regras de Moto, Entrega, Carro, Comfort/Black e Buggy;
- cliente do Passageiro para cotação pelo Core;
- política digital de pagamentos definida em código;
- CI para Passageiro/Design System e Core.

## Bloqueios obrigatórios

1. **Core ainda é parcial**
   - falta autenticação/autorização;
   - falta banco/persistência;
   - falta máquina de estados autoritativa;
   - falta matching;
   - falta localização em tempo real;
   - falta infraestrutura/deploy de produção.

2. **Matching real continua desabilitado**
   - o protótipo de "motorista encontrado" continua apenas como referência visual;
   - pagamento e despacho ainda não estão conectados.

3. **Preço v1 existe, mas a operação ainda precisa de infraestrutura**
   - o Core já contém a regra comercial;
   - o Passageiro consulta o Core quando `RAMO_CORE_BASE_URL` está configurado;
   - ainda faltam deploy, Admin, persistência/versionamento e resolução robusta de todas as localidades externas;
   - faixas comerciais que ainda não possuem valor único não podem virar cobrança exata automaticamente.

4. **Pagamento real ainda não foi integrado**
   - Pix/cartão/carteira são a política aprovada;
   - dinheiro está desativado no lançamento;
   - ainda falta escolher/integrar gateway;
   - falta ledger, conciliação, estorno e repasse.

5. **Android release usa assinatura de debug para auditoria de compilação**
   - serve somente para provar que o release compila;
   - não é assinatura válida para Play Store;
   - uma keystore de produção deverá ficar fora do Git.

6. **iOS foi validado em Simulator**
   - falta Apple Developer Team;
   - falta assinatura de distribuição;
   - falta build/teste em aparelho físico.

7. **Mapas/rotas ainda usam infraestrutura pública de desenvolvimento**
   - OpenStreetMap tiles;
   - Nominatim;
   - OSRM demo server;
   - antes do lançamento é necessário provedor/infraestrutura adequada ao uso comercial.

8. **Autenticação, privacidade e LGPD**
   - conta do usuário;
   - consentimentos;
   - política de privacidade;
   - termos;
   - retenção e exclusão de dados.

9. **Testes reais ainda faltam**
   - Android físico;
   - iPhone físico;
   - GPS real;
   - internet ruim;
   - fechamento/reabertura;
   - troca de rede;
   - dois aparelhos simultâneos Passageiro/Motorista;
   - cenários reais de pagamento e cancelamento.

10. **Regras de acesso/eligibilidade**
   - preço não substitui autorização operacional;
   - rotas 4x4 de Jericoacoara precisam validar veículo/motorista elegível no backend antes da oferta.

## Regra do projeto

Nenhum item deve ser considerado concluído apenas porque o app compila. Pagamento, preço final, elegibilidade, despacho e estado da corrida devem ser validados pelo Core.
