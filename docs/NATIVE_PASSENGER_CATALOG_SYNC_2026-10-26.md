# Sincronização do Passageiro Android/iOS com o catálogo do ADM

Autorizada por Ian após identificar três limitações exclusivas do Web: catálogo gerenciado, transporte de cotação autenticada/coordenadas e busca Google prioritária no modo gerenciado.

A mudança remove apenas as condições de plataforma desses quatro módulos de dados/domínio do Passageiro. Catálogo gerenciado continua condicionado ao modo publicado pelo servidor, mantém categorias/interseção entre regiões e resolve IDs de localidades pelas coordenadas. Quando o servidor usa catálogo legado, o fluxo legado continua disponível. Busca mantém sessão entre sugestões e detalhes e conserva nome, coordenadas e prova do estabelecimento na preparação da corrida. Cotação envia o token existente e as coordenadas em Android/iOS, como já ocorria no Web. O servidor continua sendo responsável por determinar o preço.

Não altera backend, ADM, banco, Motorista, arquivos Android/iOS, localização, câmera, widget de mapa, chaves ou bibliotecas. O servidor 099 já instalado por Ian atende este cliente. A economia de rotas permanece desligada; esta atualização não ativa nenhuma política.

A validação remove os retornos antecipados que impediam os testes de regiões geradas pelo ADM e busca Google de rodar no host nativo. Inclui testes de categorias proibidas/arquivadas/inexistentes, trajetos com regiões sem aliases históricos, ausência de tarifa, token/coordenadas, manutenção do fluxo legado e um contrato integrado com HTTP simulado: política → sugestão → detalhes do estabelecimento → cotação → preparação. Não gera corridas reais nem chama provedores pagos nos testes. O mesmo conjunto roda no Chrome; o workflow também compila Web sem publicação.

Novos pacotes: apenas Passageiro Android e iOS. Substituem o APK Passageiro entregue no lote de economia de rotas. APK Motorista anterior permanece o mesmo. Android usa o mesmo ID .preview e assinatura de homologação; não é pacote de loja. iPhone permanece sem assinatura Apple e requer provisionamento para instalar. Homologação física de pesquisa/preço/solicitação e GPS continua necessária; não alegar validação real de aparelho com base no CI.
