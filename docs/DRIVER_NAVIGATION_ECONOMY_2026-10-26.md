# Economia de rotas do motorista — preparação desativada

Solicitada pelo responsável: rota inicial por etapa (embarque/destino) e até quatro recálculos adicionais por corrida; ao atingir o limite e continuar fora da rota, mostrar “Seguir por conta própria” ou “Recalcular pelo Google Maps” (aplicativo externo). Abrir Maps pausa consultas internas até retomada explícita. Manter localização, dados da corrida, câmera e visual do mapa. Restrição posterior: controle no ADM para ativação pelo responsável, DESLIGADO POR PADRÃO.

Base: 5f11205ca71e36482cd5440c724a14579a1c7273 do PR #80; mapa/GPS nativos anteriores ao PR #79 preservados. Sem Navigation SDK novo, sem mudanças em preços, pagamentos ou flags de embarque/ocorrências. Fonte de localização e câmera não modificadas.

## Preparação

Migração aditiva 099 cria política global persistente (false/revision 0), escolhas/contadores por corrida e auditoria de solicitações/alterações administrativas. Não altera registros existentes. Conta uma solicitação antes de chamar o provedor, inclusive falhas conservadoramente, para não criar retries pagos ilimitados. Duas rotas iniciais (uma por etapa) mais quatro solicitações adicionais: no máximo seis requisições de navegação controlada por corrida. Não constitui limite de toda a conta Google: ofertas, buscas, cotação e passageiro têm outros caminhos.

ADM em Financeiro → Economia de rotas, escopos rides:read/write, revisão para recusar sobrescrita concorrente e contadores dos últimos 30 dias. Abrir a tela não ativa nem altera a configuração. O responsável deve instalar os aplicativos compatíveis antes de ativar. Apps consultam a política durante a corrida; desativar restaura o comportamento legado sem apagar escolhas/contador.

Enquanto desativado: navegação e consultas legadas preservadas. Enquanto ativado: sem consultas apenas por tempo decorrido; desvio confirmado por distância >=80m durante >=20s; intervalo mínimo de 15s, reserva serializada, limite global por corrida, destino e etapa derivados do registro autenticado. Navegação genérica de um motorista com corrida ativa é recusada para impedir bypass do endpoint controlado. Clientes antigos necessitam atualização antes da ativação.

Modo próprio/externo/pausado não cancela a corrida nem fecha a stream de localização. Escolha e contador sobrevivem a reinstanciação do serviço/retorno ao app. Iniciar a corrida não retoma automaticamente uma escolha externa; a retomada exige ação de navegação explícita e não zera contador. Uma chamada ao provedor já iniciada antes da pausa pode terminar, mas sua resposta não deve reativar a navegação nem restaurar uma linha obsoleta.

Não persiste geometria, ETA ou instruções do Google no servidor. A previsão exibida deriva da última rota recebida e não é renovada por consultas periódicas com economia ativa.

## Validação e limites

Testes de estado/capacidade, persistência e concorrência PostgreSQL, permissões e ativação ADM, navegação móvel/GPS fora de foco simulado, reabertura e fluxos existentes estão em preparação. Envio de localização com Maps real/tela bloqueada exige homologação em Android/iPhone físicos; simulação de lifecycle não comprova execução sob restrições de bateria/sistema. iPhone continua dependendo da assinatura/provisionamento Apple. Web/PWA pode ser suspenso pelo navegador.

Não instalado nem ativado na VPS. Novos APKs precisam ser recompilados após aprovação e devem encontrar Core com migração 099/API correspondente, mantendo a política desativada até decisão do responsável.

Validação local: typecheck e build Core aprovados; 180 testes ADM aprovados (incluindo ativação explícita, somente leitura e retenção após falha); dois testes puros do orçamento aprovados. O cenário PostgreSQL está preparado, mas não foi executado neste ambiente. Flutter, navegadores e builds da revisão nova ainda não executados. Envio à branch GitHub bloqueado pela revisão automática por exigir autorização explícita de publicação; nenhuma tentativa por outro canal será feita sem resolver esse bloqueio. Nada instalado ou ativado.
