# Homologação do toque do Motorista sobre a versão ativa dos cupons

Data: 2026-11-02
PR: https://github.com/iansilva23/ramo-nessa/pull/92
Branch: `feature/driver-tone-coupons-20261102`
Base imutável: `2fc82e5dfd0a`

## Evidência da VPS compartilhada pelo responsável
- Gateway `ramo-nessa-staging-gateway-1`, status `running`.
- Mount Web: `/opt/ramo-nessa-web/releases/coupons-2fc82e5dfd0a/bundles`.
- Motorista `index.html` SHA-256 `51e7dbc5b2a749355d0d7a2705604139f9d7ccd78067a00284653618c34eba43`.
- Motorista `main.dart.js` SHA-256 `e8eb196d7aa52b4fb78e119a8e9584ece869ece25162125693fb59d01fa7b92d`.
- `flutter_bootstrap.js` SHA-256 `dda0868a26b53688364aa176037fcd1a577fca3e5d4a248bfa613d52ab85b819`.

O nome da pasta sugere o commit `2fc82e5dfd0a`, mas não comprova a equivalência de bytes de produção à árvore Git. Confirmar antes de ativar.

## O que mudou
- Apenas o áudio oficial aprovado de ~2,09 s, dependência `audioplayers`, controle de ciclo de vida, seus seis testes e automações de verificação/pacote.
- Preservar toda a lógica de cupons, financeiro, mapas, navegação, chat, pagamentos, ADM, Passageiro, Core e banco de dados.
- Não fazer merge da PR #91, que usa uma base anterior.

## Pacote de revisão
- Workflow `.github/workflows/driver-tone-coupons-vps-hml.yml`.
- ZIP e script de staging apenas; sem SSH, sem deploy nem alteração automática de serviço.
- Rota reservada de teste: `/motorista-toque-hml/`; ainda **não configurada** na VPS.
- Placeholder de Maps e Web Push desativado nesse pacote de revisão. **Não serve para uma corrida real fim a fim nem para substituir /motorista/**.
- Script `deploy/staging/driver-tone-hml-stage.py` confere hash, manifesto e estado do Gateway e prepara os arquivos em `/opt/ramo-nessa-toque-hml/` sem trocar montagens.

## Homologação funcional necessária
1. Verificar autenticidade e saúde da versão ativa e disponibilidade de rollback.
2. Configurar um ambiente de teste separado com Maps/Push públicos corretos e contas de teste, sem mexer no Gateway operacional sem plano explícito.
3. Testar chegada de oferta, loop do áudio, aceite, recusa, expiração, retirada remota e offline.
4. Testar uma nova oferta depois da anterior, reconexão, PWA/browser com autoplay e comportamento em segundo plano.
5. Conferir que nenhuma tela da versão de cupons foi perdida e que os serviços financeiros e de corrida não mudaram.
6. Após aprovação, preparar um pacote de promoção específico ao Motorista, com verificação de hashes antes/depois e retorno validado.

**Estado:** só pré-homologação técnica no GitHub. VPS sem alteração. Não publicar a PR como oficial.
