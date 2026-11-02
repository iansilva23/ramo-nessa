# Third-party source tracking

Este arquivo registra projetos avaliados como possíveis fontes de referência ou componentes. Antes de incorporar código, a licença e os avisos aplicáveis devem ser preservados.

## Aprovados para estudo/reuso conforme licença identificada

- **Seifmakled/wasalny** — MIT
- **AhmedLSayed9/deliverzler** — MIT
- **ssoad/flutter_riverpod_clean_architecture** — MIT
- **ASWINKMANOJ/RideSync** — MIT
- **MoharibDigital/WayGo** — Apache-2.0
- **SANJAIKUMAR-28/Ride_Hailing_Service_UserApp** — MIT
- **OpenConsultingGroup/Taxi-App** — MIT
- **TesteurManiak/flutter_map_animations** — MIT
- **gskinner/flutter_animate** — BSD-3-Clause
- **rive-app/rive-flutter** — MIT
- **xvrh/lottie-flutter** — MIT

## Não incorporar sem nova verificação

Projetos sem licença clara, com licença ausente no repositório, ou com termos conflitantes devem ser usados apenas como referência conceitual até autorização/licença ser confirmada.

Isso inclui qualquer template comprado cujo direito de redistribuição/incorporação precise ser confirmado nos termos da compra.

## Regra

Nenhuma credencial, chave privada ou configuração de terceiros será copiada para o Ramo Nessa.


## Dependências atualmente incorporadas ao app Passageiro

- **google_maps_flutter 2.18.1** — BSD-3-Clause
- **geolocator 14.0.3** — MIT
- **http 1.6.0** — BSD-3-Clause
- **latlong2 0.10.1** — Apache-2.0

## Serviços de mapas

- **Google Maps Platform** — Maps SDK for Android/iOS, Routes API e Places API (New).
- As credenciais são mantidas separadas entre Android, iOS e Core.
- Preview e Test Stack usam serviços locais/mocks para não depender de chamadas externas.

O uso comercial deve seguir os termos, restrições de chave, billing e quotas configurados no projeto Google Cloud da operação.
