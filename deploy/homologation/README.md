# Preparação isolada de ocorrências

`prepare-occurrences.mjs` reutiliza o stack de `deploy/test`, gera segredos novos e grava uma configuração privada sem variáveis herdadas do host. Não executa Docker, build, migração ou ativação. Não copia banco, usuários ou credenciais existentes. Pasta de saída deve ser nova; não há opção force.

Projeto: ramo-nessa-occurrence-homologation. Porta futura: somente 127.0.0.1:18080. Banco e tags de imagem separados. Maps, documentos e OTP são simulados; Pix/cartão/repasse reais não estão configurados. Não declarar homologação física ou financeira usando esses simuladores.

Exportar os fontes para uma pasta persistente separada antes de preparar a configuração: os caminhos de build apontam para esses fontes. Não usar pasta temporária com limpeza automática. Não mudar o checkout do app ativo. `docker compose ... config --quiet` valida sem iniciar serviços e sem imprimir os segredos.

A próxima etapa precisa verificar porta livre e controlar o build (limites mem_limit são de execução, não limitam BuildKit). Não iniciar automaticamente. Nenhum domínio, DNS, Caddy, porta pública, volume ou imagem do ambiente ativo é alterado. Os controles A/B/C não são ativados por esta preparação; não há banco novo até uma inicialização posterior explícita.

Testes: `node --test deploy/homologation/prepare-occurrences.test.mjs`. A configuração gerada também foi analisada com um parser YAML, verificando rede local, dependências preservadas, banco privado e limites de memória dos seis serviços. Docker Compose no host do responsável fará a validação final com `config --quiet`; não confundir análise YAML com boot funcional do stack.
