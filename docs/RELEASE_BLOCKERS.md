# Bloqueios atuais de publicação

Este arquivo separa **compilação técnica** de **prontidão comercial**.

O Ramo Nessa ainda não deve ser publicado como produto final.

## Bloqueios obrigatórios

1. **Backend/Core ainda não existe**
   - matching;
   - autoridade da corrida;
   - pricing;
   - autenticação/autorização;
   - notificações;
   - pagamentos;
   - auditoria.

2. **Matching real está desabilitado**
   - o protótipo de "motorista encontrado" permanece apenas como referência visual;
   - o fluxo normal não entra nele.

3. **Preços ainda são provisórios**
   - valores exibidos no Passageiro não são preço de produção.

4. **Android release usa assinatura de debug para auditoria de compilação**
   - serve somente para provar que o release compila;
   - não é assinatura válida para distribuição na Play Store;
   - uma keystore de produção deverá ser criada e mantida fora do Git.

5. **iOS foi validado em Simulator**
   - falta Apple Developer Team;
   - falta assinatura de distribuição;
   - falta build/teste em aparelho físico.

6. **Mapas/rotas usam infraestrutura pública de desenvolvimento**
   - OpenStreetMap tiles;
   - Nominatim;
   - OSRM demo server;
   - antes do lançamento é necessário provedor/infraestrutura adequado ao uso comercial.

7. **Autenticação, privacidade e LGPD ainda não foram implementadas**
   - conta do usuário;
   - consentimentos;
   - política de privacidade;
   - termos;
   - retenção e exclusão de dados.

8. **Testes reais ainda faltam**
   - Android físico;
   - iPhone físico;
   - GPS real;
   - internet ruim;
   - fechamento/reabertura;
   - troca de rede;
   - dois aparelhos simultâneos passageiro/motorista.

## Regra do projeto

Nenhum item acima deve ser considerado concluído apenas porque o app compila.
