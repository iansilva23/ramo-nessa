# Instalação da economia de rotas — inicialmente desligada

Diagnóstico fornecido por Ian em 26/10/2026 às 16:31 (Fortaleza): Core c877a82fc032f71e0cb5c6ec48684b617d857095d9381fdb3aab7802945e02bf, lock 3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e, migrações 001–098, catálogo publicado 89, 41 regiões e 14 tarifas. Web ativo: /opt/ramo-nessa-web/releases/driver-white-gps-f84acc462925/bundles. ADM app.js c4ba4357ebc1a0f44f41c84b19fa1d5115d6259f0b5c4fcbf7c8af2453f2a8bd.

Fonte da aplicação: 77fa0e56d9427a2b8103f1e9e46c17735598b210. Contém a feature do PR #81 e duas retomadas da câmera aprovadas para Web, explicitamente limitadas por kIsWeb. A configuração e os arquivos de mapa/localização nativa permanecem iguais aos aprovados no PR #80. O build Web usa as mesmas opções públicas do GPS Cinema atual (heading, tilt e Map ID de20bf289d6db3ad15fdb14b); os builds nativos não recebem essas opções Web.

O instalador:
- Confere Core/ADM/base Web, catálogo e histórico de migrações antes da troca.
- Faz backup e testa restauração PostgreSQL isolada, sem pagamentos reais.
- Aplica apenas migração aditiva 099, validando que a economia está desligada; não ativa outras funções.
- Sobrepõe apenas os quatro módulos Core e três arquivos ADM previstos, sobre as imagens ativas, preservando ambiente/credenciais/redes/mounts/saúde.
- Copia Passageiro Web ativo sem alteração e publica Motorista Web compatível, preservando configurações Maps/Firebase.
- Verifica saúde, arquivos públicos e permissões de localização; mantém a política de economia desligada.
- Fornece comando de retorno de código; não restaura banco ou pagamentos. Se houver adoção das novas estruturas, preserva o Core compatível. Recusa retorno caso a economia já esteja ativada.

O ensaio reproduz a base 098 em Docker isolado, testa instalação, falhas após Core/ADM e gateway ausente, retorno, preservação financeira, documentos, suporte, Pix já existente, recuperação de corrida e economia desligada. Artefatos só são publicados se o ensaio passar.

Ordem de instalação: servidor primeiro; depois Android. Para iPhone, o ZIP sem assinatura exige assinatura/provisionamento Apple, não instala diretamente. Android usa a mesma assinatura de homologação e IDs .preview dos APKs anteriores; não é pacote para loja. Instalar clientes compatíveis antes de ativar no ADM. Homologar localização com Maps real/tela bloqueada em aparelhos físicos antes de ativar.

Nada é instalado automaticamente na VPS pelo workflow GitHub. A autorização de Ian cobre a preparação, publicação dos pacotes e instalação manual na VPS mantendo a economia desligada.
