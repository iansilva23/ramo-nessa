# Matriz de fontes — Ramo Nessa

Esta matriz define como cada projeto pesquisado deve ser tratado. O objetivo é aproveitar soluções maduras sem transformar o Ramo Nessa em uma colagem de clones.

| Fonte | Status | Aproveitar | Não aproveitar diretamente |
| --- | --- | --- | --- |
| Seifmakled/wasalny (MIT) | **ADAPTAR** | hierarquia visual, bottom sheets, microinterações, seleção de categoria, estados da viagem, ideia de interpolação do veículo | mapa fictício/custom-painted como mapa de produção, dados mock |
| AhmedLSayed9/deliverzler (MIT) | **ADAPTAR** | fluxo de entrega, tracking, notificações, organização por camadas, ideias de Cloud Functions | domínio de restaurante específico |
| ssoad/flutter_riverpod_clean_architecture (MIT) | **REFERÊNCIA FORTE** | separação domain/data/presentation, testes, offline/sync, CI/CD, secure storage | copiar toda a complexidade antes de ela ser necessária |
| MoharibDigital/WayGo (Apache-2.0) | **ADAPTAR SELETIVAMENTE** | modelos de oferta, telas de chat/oferta, internacionalização, alguns fluxos | simuladores/mocks de motorista, chat automático, regras fake de corrida |
| SANJAIKUMAR-28/Ride_Hailing_Service_UserApp (MIT) | **REFERÊNCIA** | fluxos de autenticação/mapa/pagamento, assets e organização de funcionalidades | dependências antigas e decisões de segurança no cliente |
| ASWINKMANOJ/RideSync (MIT) | **ADAPTAR BACKEND** | WebSocket de telemetria, Redis, H3, consulta de motoristas próximos, fallback HTTP | usar como backend completo; ele resolve principalmente telemetria/dispatch |
| google_maps_flutter / Google Maps Platform | **STACK ATUAL** | mapa nativo, Places, Routes, distância, ETA e geometria via contratos próprios do Core | expor chave de servidor no app ou acoplar regras comerciais diretamente ao SDK |
| TesteurManiak/flutter_map_animations (MIT) | **NÃO USAR NO STACK ATUAL** | referência de animações | adicionar dependência paralela ao Google Maps sem necessidade |
| gskinner/flutter_animate (BSD-3-Clause) | **USAR** | microinterações e motion consistente | animação excessiva sem função |
| rive-app/rive-flutter (MIT) | **USAR PONTUALMENTE** | busca de motorista e estados especiais | usar em cada elemento da interface |
| xvrh/lottie-flutter (MIT) | **USAR PONTUALMENTE** | estados e loaders específicos | assets sem licença clara |
| OpenConsultingGroup/Taxi-App (MIT) | **REFERÊNCIA** | ideias de BLoC, polyline e animações | código legado como fundação |
| Template Flutter comprado | **AUDITORIA PENDENTE** | design/components se a licença da compra permitir | qualquer parte antes de recebermos e auditarmos o ZIP |
| Clone principal sem licença clara | **SOMENTE REFERÊNCIA** | comportamento/ideias técnicas | incorporar código em produto comercial sem licença/autorização |
| Segundo clone com licença permissiva já verificada | **ADAPTAR SE ÚTIL** | telas/módulos pontuais | arquitetura antiga como fundação |

## Regra de integração

Cada módulo transplantado deverá passar por:

1. verificação de licença;
2. atualização para a versão Flutter/Dart do Ramo Nessa;
3. remoção de chaves, endpoints e identidade do projeto original;
4. adequação ao Design System Ramo Nessa;
5. adaptação aos contratos do Ramo Nessa Core;
6. testes;
7. registro em THIRD_PARTY_NOTICES.md quando houver código incorporado.

## Decisão atual

O Ramo Nessa terá **código-base próprio**. Repositórios externos serão doadores de soluções específicas, e não uma fundação única renomeada.
