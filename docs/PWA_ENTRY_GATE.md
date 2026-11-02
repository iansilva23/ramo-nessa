# Entrada por deslize da PWA instalada

Fonte da aplicação: `aab0b0c36fe15cf78c24d7b2beab8b69c099294a`.

## Comportamento

A tela translúcida aparece somente quando `navigator.standalone === true` ou o modo de exibição é `standalone`. Em uma aba comum, o script termina antes de criar elementos, observadores ou listeners de ciclo de vida. Os arquivos são exclusivos das pastas web dos dois apps; nenhum código Dart ou binário Android/iOS é alterado.

Um deslize horizontal em qualquer região, para a direita ou esquerda, revela o app. Toques curtos, movimentos predominantemente verticais, cancelamento, segundo ponteiro e redimensionamento cancelam o gesto. A ativação nativa do botão de tela inteira permite usar teclado ou leitor de tela. O layout contempla orientação deitada, movimento reduzido e ausência de suporte a blur.

Enquanto a tela aparece e durante sua saída, os elementos abaixo ficam `inert`. A observação de novos filhos do body protege também a raiz Flutter quando ela monta depois da tela de entrada. O estado inert que já existia antes é preservado. O gesto e o clique de compatibilidade ficam na superfície da entrada; não são encaminhados aos controles do app.

Ao voltar de um documento realmente oculto, a tela reaparece. `pageshow.persisted` cobre restauração de página. Focus/blur são ignorados, para não confundir simples mudança de foco com nova entrada. Se o app for ocultado durante a saída, a liberação pendente é cancelada. Não há focus automático, clique sintético, pedido de permissão nem ajuste das coordenadas do Flutter.

## Limites

Esta é uma etapa visual de entrada solicitada pelo usuário. Ela não substitui login, PIN ou biometria e não comprova a correção do defeito de coordenadas relatado no iPhone físico. O ciclo de permissões, os provedores, os pagamentos e os prazos das corridas não são alterados. O aceite no aparelho físico continua necessário após publicar.

## Publicação

O atualizador exige a última atualização concluída `a8a766a62fb637c687bc7d079ebb247b864f82dd`, preserva o Caddy byte a byte e troca somente o mount dos pacotes web no gateway. ZIP, manifesto e todos os arquivos são conferidos antes da ativação. Depois dela, index, main.dart.js, bridge de push, script e CSS da entrada são conferidos pelas URLs públicas. Uma falha nessas verificações aciona retorno ao mount e link anteriores. Core, banco, migrações, site, ADM e configurações dos provedores ficam fora do escopo.

Após aplicar, fechar o app instalado e as abas antigas. Recriar o ícone pelo Safari garante uma instalação com os arquivos e metadados atuais; pode ser necessário entrar novamente na conta. Não apagar dados gerais do navegador.

## Evidências de regressão

- [Navegadores](https://github.com/iansilva23/ramo-nessa/actions/runs/38983731711): os jobs Chromium e WebKit aprovaram os modos aba/instalado, dois sentidos do deslize, gesto curto/vertical/cancelado, segundo ponteiro, rotação, retorno durante a saída, teclado, movimento reduzido e contraste sobre fundo branco.
- [Login Flutter instalado](https://github.com/iansilva23/ramo-nessa/actions/runs/38984307965): os quatro jobs passageiro/motorista × Chromium/WebKit aprovaram digitação após o deslize, cookie HttpOnly, restauração de sessão, nova entrada após reload e logout. A conta nova do motorista chega à etapa de cadastro; o backend simulado não fornece seu cadastro completo.
- O primeiro ensaio nativo com anotação local (run 38984641305) falhou: as capturas antes e depois do gesto ainda mostravam o splash branco. O teste enviara o deslize antes da tela estar pintada. Isso não validou nem reprovou o gesto da aplicação.
- [Continuação com espera visual](https://github.com/iansilva23/ramo-nessa/actions/runs/38986129484): aprovado. A instalação usa a interface nativa do Safari e a abertura usa o ícone. Antes do primeiro toque, o teste exige pixels do vidro escuro e do símbolo amarelo da entrada. Depois exige gesto para a direita, toque no avatar pintado e retorno pelo ícone com gesto para a esquerda. A espera não consulta a árvore de acessibilidade web nem envia toques de preparação. Capturas e eventos confirmaram dois bloqueios e dois desbloqueios. O primeiro toque após o deslize foi recebido em client/page (44,44), com view.y, scrollY e visualViewport.offsetTop iguais a zero, escala 1 e sem ativar semântica. A captura confirmou a abertura de Perfil. O ensaio anterior com telemetria ampliada (run 38986030047) também aprovou o mesmo fluxo.

Os testes de continuação exigem igualdade dos arquivos da aplicação com o commit acima. Os bundles de revisão usados nas cópias descartáveis têm fonte Flutter e lockfiles conferidos antes da sobreposição dos arquivos web. O pacote configurado é recompilado do commit exato. Nenhum teste usa provedores reais ou contas de produção.

## Pacote configurado aprovado

Run 38986030047, job 117260382285, artefato 12082748606. Ambos os papéis foram recompilados da fonte exata e verificados; os seis jobs de regressão anteriores foram exigidos antes da compilação.

- ZIP SHA-256: `ca464508147e163ef302dc2cba0b6f6e620468db5a4aafc9145df9dff11727e2`.
- Manifesto SHA-256: `8265e3c4ab55fa82345e7b593f7771f0d102c6afe64fc208af26f8146f00bfd9`.
- A extração local conferiu todos os arquivos do manifesto e a configuração Firebase pública por papel. Script e CSS da entrada coincidem byte a byte com a fonte testada.
