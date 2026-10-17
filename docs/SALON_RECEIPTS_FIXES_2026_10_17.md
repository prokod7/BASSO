# Correções dos relatos da Basso — 16/10/2026

## Comportamento entregue

- Fechar mesa encerra comandas vazias e libera a mesa sem inventar recebimentos. Consumo ativo ou pagamentos impedem o encerramento e exigem o fluxo financeiro/cancelamento correto. O botão não fica mais desabilitado só por existir histórico de comandas.
- Sabores ordenados por nome em pt-BR no catálogo runtime, catálogo de referência, montadores e administração, inclusive após edição.
- Cadastro de produto com opção “Somente salão e mesas”. Grava os canais dine_in e table_qr; não aparece em delivery/retirada/balcão. Os canais individuais continuam editáveis.
- Ingredientes retirados e adicionais, com quantidades e nomes, agrupados imediatamente abaixo do sabor correspondente na Central da Comanda, acompanhamento do cliente, KDS e impressão pelo navegador.
- Título compacto “Pizza Grande” / “Pizza Broto” na comanda; sabores detalhados uma única vez. Bebida do combo deixa de repetir no detalhamento. Notas e cortes são preservados.
- Snapshot dos nomes dos sabores/adicionais/produtos utilizados é calculado pelo servidor, permitindo preservar os nomes após mudanças no cadastro.
- Numeração diária gerada no PostgreSQL, com contador atômico por data de America/Sao_Paulo. Reinicia à meia-noite local, sem alterar orders.id ou o número permanente de integração/fiscal. Cancelamento/arquivamento não reutiliza números.
- Painéis, busca, alertas, acompanhamento, novas respostas de checkout, exportação de relatórios e impressão utilizam a numeração diária.
- PWA do garçom com manifesto próprio e start_url=/garcom. Painel do garçom explica acesso por login individual e instalação no Safari/iPhone e Chrome/Android.
- Bridge recebe título, detalhes e número diário preparados pelo servidor. Inclui consulta do número atual para jobs históricos.

## Aplicado no banco Basso

Migration 038 aplicada e verificada nesta sessão. As duas comandas abertas nas mesas 1 e 2 não tinham pedidos nem pagamentos; foram encerradas pelo RPC corrigido e ambas as mesas ficaram livres.

Somente os pedidos identificados nos prints como testes foram cancelados e arquivados: IDs `ord_mvbh1e5t_acto054` (número permanente 10039) e `ord_mvbhldcu_7ni9gh9` (10040). Não tinham pagamentos recebidos. Cancelamento usou a rotina transacional existente, com reconciliação de estoque, histórico e auditoria; jobs pendentes foram cancelados e links privados revogados. Outros pedidos foram preservados.

A tabela privada de contadores tem RLS e nenhum acesso público; não possuir políticas públicas é intencional. O RPC de fechar mesa continua acessível somente pelo servidor/service_role.

## Validação

- 180 testes em 22 arquivos, incluindo nove regressões novas.
- PostgreSQL isolado: virada da data em São Paulo, sequência sem duplicações, preservação do número permanente, mesa vazia sem pagamento fictício e bloqueio com consumo/recebimento.
- TypeScript, build de produção, 92 verificações estáticas, sequência de 38 migrations e auditoria de controles.
- Conferência no banco: migration 38 presente, trigger diário presente, projeção pública com número diário, nenhuma duplicação de número por data, mesas 1 e 2 livres e testes arquivados.

## Publicação e validação física

Nenhum deploy na Vercel executado. Publicar a versão deste pacote para disponibilizar as telas corrigidas; o banco já está preparado. Para quem utiliza o agente local, atualizar também `bridge/print-bridge.mjs` no computador da pizzaria e reiniciar o agente. Impressão física em 58/80 mm e instalação em aparelhos reais ainda precisam ser conferidas no estabelecimento.

Não foram inventados preços nem cadastradas automaticamente bebidas incompletas dos prints. A opção de restringir ao salão está pronta para uso no cadastro.
