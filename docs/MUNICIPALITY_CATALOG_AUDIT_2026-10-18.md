# Ramo Nessa V5 — Municípios, localidades e segurança comercial

A municipalidade administrativa **não** é equivalente à zona de preços `prea`, `jijoca` ou `jericoacoara`. Identificadores comerciais, coordenadas, tarifas aprovadas e transfers existentes não devem ser renomeados ou migrados automaticamente.

## Operação autorizada nesta fase
- **Cruz/CE**: Preá e localidades reconhecidas, incluindo sede/Preá e Cavalo Bravo.
- **Jijoca de Jericoacoara/CE**: sede de Jijoca, seus povoados e Vila de Jericoacoara; a Vila tem regras especiais de acesso.
- **Outros municípios**: permanecem identificados como destinos externos. Táxi e Mototáxi locais NÃO devem ter abertura genérica fora dos dois municípios. Transfer só pode permanecer quando explicitamente aprovado por tarifa fixa/rota autorizada.

## Fontes públicas
- Prefeitura Jijoca: https://www.jijocadejericoacoara.ce.gov.br/informa/1974/d-vidas-frequentes
- Prefeitura Cruz — Preá e Cavalo Bravo: https://prefeitura.cruz.ce.gov.br/transparencia-municipal/portal-de-licitacoes/licitacao/pe-2123-seduc/
- Prefeitura Acaraú — Barrinha de Baixo: https://www.acarau.ce.gov.br/ambientalarq/439/2856/arq_24.11.190001_indeferidopelosetortecnico.pdf
- Governo Ceará — Aeroporto JJD em Cruz: https://www.ce.gov.br/2026/03/10/aditivo-que-concede-gestao-do-aeroporto-de-jericoacoara-a-fraport-e-assinado-em-brasilia/
- Comunidades Jijoca: https://jijocadejericoacoara.ce.gov.br/conselhos.php?id=13&tp=
- Localidades Jijoca, projetos 2026: https://www.cidades.ce.gov.br/wp-content/uploads/sites/12/2026/03/Resultado-Preliminar-MI-001_2026-SITE.pdf
- Distrito Parazinho pertence a Granja: https://granja.ce.gov.br/localidades.php?cat=2&desc=
- Municípios do Ceará no IBGE: https://www.ibge.gov.br/explica/codigos-dos-municipios.php

## Correções confirmadas
- `prea/prea`, `prea/vila-prea`, `prea/cavalo-bravo`: Cruz.
- `prea/barrinha-de-baixo`: **Acaraú**, não Cruz.
- `prea/airport-jjd` e `external/airport-jjd`: Cruz.
- `prea/jericoacoara`, `prea/jijoca`, `jericoacoara/jericoacoara`: Jijoca de Jericoacoara.
- `prea/lagoa-do-paraiso`: Jijoca de Jericoacoara.
- `prea/parazinha` e `external/parazinha`: Granja (distrito Parazinho, confirmar correspondência exata da chave 'parazinha' antes da aplicação operacional).
- `jijoca/baixio`, `jijoca/mangue-seco`, `jijoca/chapadinha`: Jijoca (documentos municipais).
- `jijoca/carro-quebrado`, `jijoca/cruzeiro-do-brandao`, `jijoca/lagoa-das-pedras`, `jijoca/corrego-do-urubu`, `jijoca/corrego-do-mourao`, `jijoca/corrego-perdido`: Jijoca (documentação municipal/estadual).

## Localidades pendentes
Não atribuir automaticamente municípios a nomes de hotéis, pousadas, projetos, pontos de turismo ou topônimos com homônimos:
`prea/aranau`, `prea/beach-house`, `prea/cabana`, `prea/castelhano`, `prea/d3-luna`, `prea/lagamar`, `prea/triangulo-do-marco`, `prea/vida-ao-vento`, `prea/prea-beach-villas`, `prea/kite-lodge`, `jijoca/vila-sao-paulo`, `external/triangulo-do-marco`, e outros registros sem fonte suficiente.

O Core marca estes casos como `pending_review`. O editor permite vincular o município **com prova pública e publicação versionada**; o mapeamento inicial não é uma migração de localização GPS.

## Auditoria de preços / próximos testes antes do deploy
- PR #29: corrigiu o match dos transfers e protegeu a seleção de veículo sem preço; já implantado na homologação.
- PR #30: fallback regional opt-in apenas com tarifa, km máximo, lista fechada e dia/noite publicados.
- PR #31: tabela completa de preços e adicionais noturnos editáveis no ADM, ainda isolado.
- Este PR: município é campo independente de zona, revisão por fonte, segurança em corridas locais e proteção contra ampliação regional para cidades externas.

**Não publicar automaticamente.** Auditar regras fixas de ida/volta, todas as 5 categorias, ausência de tarifa e 22h, catalogação GPS, overrides por categoria e rollback por versão. Não inferir disponibilidade a partir de geocercas genéricas nem de nomes de município. Conferir contratos, permissões e regulamentações aplicáveis ao serviço antes da operação real.
