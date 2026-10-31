# Ramo Nessa V5 — Homologação de campo (UAT) Android / iOS / Web

**Status:** BLOQUEADA até testes em dispositivos e aceite explícito do proprietário.  
**Escopo:** PR #35 (DRAFT), `integration/pricing-v5-finance-safe-20261019`, base `ops/asaas-pricing-integration-20261019`.  
**Regra visual:** não alterar dimensões, arredondamento, padding, largura, altura nem posição do card **“Escolha seu destino”**. Nenhuma tentativa de ajustar esse card com base em mock de captura visual.  
**Regra operacional:** não fazer merge, deploy, mudar tarifas, ativar chaves ou fazer corrida/cobrança real sem autorização separada.

## Preparação segura — antes de testar

- [ ] Confirmar que os binários usados foram produzidos pelo **mesmo commit SHA** do PR DRAFT; registrar SHA, run do GitHub Actions e plataforma.
- [ ] Instalar Android em aparelho de teste e iOS em aparelho autorizado; build de **iOS Simulator sem assinatura não é instalável em iPhone**.
- [ ] Testar Web **no navegador** Safari e Chrome; não confundir com o PWA instalado/standalone nem incentivar instalação sem decisão atualizada.
- [ ] Garantir ambiente de **homologação dedicado**, contas fictícias e motorista habilitado para teste; não usar conta ou saldo real de passageiro.
- [ ] Confirmar autorização explícita, orçamento/alertas e limite de uso **antes** de usar Google Maps/Routes reais. Os testes automatizados com mocks **não** provam o comportamento da API.
- [ ] Sem chaves reais, marcar o teste dependente de Google/OTP/PSP como **BLOQUEADO** (não como aprovado).
- [ ] Evitar executar comandos/deploy sobre a VPS existente; fotos, vídeo, logs e capturas devem omitir tokens, telefones, placas e dados pessoais.

## Matriz mínima de casos — executar no Android e iOS, mais browser onde aplicável

| ID | Fluxo a verificar | Resultado esperado | Evidência |
|---|---|---|---|
| M01 | Primeiro login com permissão de localização e notificações | Pedidos claros, permissões corretas, sem travar ou repetir indefinidamente | Gravação curta |
| M02 | Negar localização, depois liberar nas configurações | Mensagem útil, recuperação possível; sem origem ou GPS inventado | Vídeo + log |
| M03 | Localização real em ruas distintas do Preá/Jijoca | Pino corresponde ao aparelho; botão “Minha localização” recenteira com zoom útil | Capturas + coordenadas arredondadas |
| M04 | Home sem destino e com destino selecionado, claro/escuro, tela estreita | **“Escolha seu destino” permanece com o layout já aprovado**; nenhum card sobreposto | Prints lado a lado |
| M05 | Preá, Jijoca, Vila Jeri e aeroporto JJD | Origem/destino corretos, sem deslocamento para outro município/estado nem zoom exagerado | Capturas da rota |
| M06 | Categoria/veículo/preço ao selecionar rota, dia e após 22h | Mostrar só opções elegíveis e seus preços exatos **aprovados**; valor apresentado é o confirmado pelo Core | Capturas de cada categoria |
| M07 | Limites de circulação: carro popular na Vila e serviços locais Cruz/Jijoca | Não oferecer modalidade não autorizada; não transformar destino externo em corrida local | Captura de indisponibilidade |
| M08 | Sem motorista, recusa e expiração de oferta de 35 s | Não ficar preso em busca; repetir busca/cancelar seguindo a regra aprovada | Vídeo + estado |
| M09 | Motorista aceita: foto, veículo, placa, avaliação/ETA disponíveis | Confirmação correta, sem dados fictícios tratados como reais | Capturas sem PII |
| M10 | Pagamento fictício/sandbox autorizado: Pix, cartão, recusado e expirado | Reserva do motorista e liberação da corrida seguem o Core; **sem débito de verdade** | IDs sandbox e logs mascarados |
| M11 | Motorista a caminho, “Cheguei”, embarque, “Iniciar corrida” | Rota troca de coleta para destino; atualização do GPS não pula zoom nem volta à fase anterior | Gravação dos dois aparelhos |
| M12 | Localização sem rede/intermitente, GPS inválido/desatualizado | Mensagem de posição indisponível; nenhuma rota falsa, estado coerente após reconexão | Vídeo + log |
| M13 | Cancelamento pelo Passageiro e pelo Motorista, sem aceitar oferta | Estados e eventual estorno **simulado** condizentes com o backend; sem compensação indevida | Referências sandbox |
| M14 | Conclusão, avaliação, reentrada no app | Encerramento correto, uma avaliação por corrida conforme política e sem oferta sobreposta | Vídeo + log |
| M15 | Web Safari/Chrome nas larguras 320/390/desktop | Layout, mapa e permissões coerentes; navegação no browser sem banner PWA indevido | Capturas por navegador |
| M16 | ADM: rascunho de tarifas/municípios, publicar **somente em ambiente descartável** | Controle de versão, auditoria, permissão e rollback; zero alteração em catálogo real | Log sanitizado + diff |

## Gate geográfico e comercial — NÃO tomar decisões por inferência

- [ ] Revisar individualmente **26 atribuições municipais pendentes** (inventário: `docs/MUNICIPALITY_FULL_INVENTORY_2026-10-18.md`); manter `pending_review` quando faltar prova suficiente.
- [ ] Reconciliar antes de qualquer release o transfer **Jericoacoara ↔ Aeroporto JJD Comfort/Black**: catálogo legado **R$ 240** versus revisão comercial aplicada **R$ 220**. **Não alterar preço automaticamente**; requer confirmação explícita do proprietário.
- [ ] Confirmar que os municípios com serviços locais são **Cruz e Jijoca de Jericoacoara**; município não é o mesmo atributo que zona comercial.
- [ ] Nenhuma nova tarifa regional por km sem preço aprovado, rota/município confirmados, lista explícita de localidades e publicação versionada pelo ADM.
- [ ] Conferir leis, autorizações e regras aplicáveis antes de permitir qualquer categoria em novas áreas; simulação técnica não substitui liberação operacional.

## Como registrar uma execução

Para **cada linha M01–M16**, registrar em issue/comentário de homologação:

```text
Data:
App e plataforma: Passageiro/Motorista/ADM — Android/iOS/Safari/Chrome
Modelo/SO/tamanho de tela:
Commit SHA / Build workflow:
Ambiente: homologação (nunca produção)
ID do teste:
Resultado: APROVADO | REPROVADO | BLOQUEADO | NÃO APLICÁVEL
Resultado observado:
Evidências: vídeo, print, log sanitizado, ID de corrida de teste
Desvio encontrado / issue:
Responsável pelo aceite:
```

**Aceite somente se:** não houver falha crítica ou regressão de layout, cada bloqueio tiver prova e decisão, a operação estiver homologada, e o proprietário autorizar explicitamente merge/deploy/publicação após plano de backup/rollback. CI verde, imagens com mapa simulado e compilações **não** são aceite de campo.
