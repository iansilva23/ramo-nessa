# Atualização nativa consolidada — 26/10/2026

Solicitada pelo responsável: atualizar Passageiro e Motorista Android/iOS e verificar outras alterações prontas. Fonte fixada em f84acc46292537266e85215bf39253b2dc1dbec7, incluindo o PR #79 sobre #78/#77. Não modifica nem publica o servidor/Web e não faz merge.

Além dos três ajustes de destino/notificações/nomes, a comparação com a fonte do workflow conectado anterior (1b72444f) identifica Guia Local, Atividades/histórico, recuperação de corrida/Pix, chat/WhatsApp, avaliação do passageiro, cartões minimizáveis e correções de mapa/navegação. Esse workflow anterior não comprova qual versão está instalada no aparelho do responsável. Os controles de embarque/ocorrências/bônus continuam dependentes do servidor e não são ativados pela compilação.

Inclui cartões expandidos brancos e recuperação de navegação do PR #79. Os flags específicos de GPS Cinema Web não substituem a câmera nativa: DriverMapConfig já contém câmera Android/iOS com zoom 17.2, inclinação 52 graus e orientação calculada por movimento. Validação com GPS real permanece necessária.

Empacotamento: análise/testes e builds conectados dos dois apps para as duas plataformas, com validação obrigatória de Maps/FCM. Android conserva a assinatura estável de teste e os IDs separados br.com.ramonessa.passenger.preview e br.com.ramonessa.driver.preview, como o fluxo conectado existente; não são artefatos de Play Store e a atualização sobre um APK existente depende de mesma identidade/assinatura. Não há fallback para Maps ou push desligados. VersionCode usa timestamp para evitar retornar ao número antigo do workflow.

O fluxo iPhone existente não possui assinatura/provisionamento Apple: o pacote gerado é explicitamente identificado SEM-ASSINATURA e não pode ser instalado diretamente. Não cria IPA instalável nem publica TestFlight. A distribuição exige configuração Apple pelo responsável; não pedir senhas, certificados privados ou tokens pelo chat.

Compilações em andamento. Aceitação física e assinatura/distribuição iPhone permanecem pendentes.
