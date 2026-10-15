# Basso — combos, promoções, autonomia e comandas

## Implementado

- Broto salgada permite dois sabores salgados e calcula 50% de cada preço. Broto doce permite um sabor; mistura doce/salgada na broto é bloqueada no servidor e em trigger de itens. A Grande mantém a regra anterior.
- O cardápio público hidrata nomes, preços, ingredientes, pausas e novos IDs do banco, em vez de atualizar apenas flags do catálogo estático. Cardápio, PDV e garçom reconciliam o menu a cada 15 segundos quando a aba está visível. O checkout continua recalculando os preços no servidor.
- Nome, telefone principal, telefones adicionais, Instagram e horários por dia são editáveis em Configurações. A agenda pública e a abertura automática usam `business_settings.opening_hours`, com fuso São Paulo e suporte à madrugada. Override manual continua disponível no controle da loja.
- Produtos e sabores possuem controles de dias/horários de disponibilidade. Bairros e taxas continuam administráveis e são reconciliados no PDV; a cotação usa os valores atuais do banco.
- Criar/editar combos permite 1 ou 2 Grandes salgadas, pizza doce Broto/Grande de um sabor, sabores autorizados, refrigerantes, preço, canais, dias e horários. O montador mostra a descrição e preço salvos e valida a composição no servidor. A escolha e o nome dos componentes ficam no item e na impressão.
- As promoções públicas refletem o canal selecionado. Preço promocional aparece no montador e no item, preservando adicionais; sabores fora da promoção não recebem desconto.
- Mesas/garçom oferecem comanda individual por pessoa ou conta compartilhada da mesa. Pedidos e recebimentos usam a comanda selecionada. No garçom, trocar/abrir outra comanda com itens pendentes é bloqueado para evitar atribuição indevida. Comandas individuais continuam vinculadas a uma mesa.

## Ofertas da migration 033

| Oferta | Preço | Dias | Canais |
|---|---:|---|---|
| Terça Maluca — Grande, 8 sabores das imagens | R$ 39,99 | Terça | Delivery/retirada |
| Quarta da Pizza — Grande, 16 sabores das imagens | R$ 44,99 | Quarta | Delivery/retirada |
| Quinta das Tradicionais — Grande, 21 sabores das imagens | R$ 49,90 | Quinta | Delivery/retirada |
| Combo Premium 1 — 1 Grande salgada + 1 Broto doce + refrigerante 2 L | R$ 155,90 | Todos | Delivery/retirada/balcão/salão/QR |
| Combo Premium 2 — 2 Grandes salgadas + 1 Grande doce + refrigerante 2 L | R$ 269,90 | Todos | Delivery/retirada/balcão/salão/QR |

A lista de sabores/bebidas é explícita na migration. Chocolate ao Leite das artes usa o ID `chocolate` do catálogo existente; Kit Kat usa `kitkat`. Os refrigerantes Premium são Coca-Cola, Guaraná Antarctica, Fanta Uva, Fanta Laranja e Sprite, todos 2 L. A oferta Premium inclui os 11 salgados e os 10 doces das artes, sem ampliar para todos os sabores. Ofertas existentes com o mesmo nome/ID não são sobrescritas. O combo anterior permanece disponível conforme sua configuração.

## Validação e publicação

- 165 testes passaram em 19 arquivos. Incluem migração em PGlite/PostgreSQL isolado, listas/preços/canais das ofertas, reaplicação sem sobrescrever preços do gestor e trigger bloqueando inserção/edição de broto doce com dois sabores.
- TypeScript e build de produção aprovados; sequência de 33 migrations aprovada; auditoria de controles sem suspeitas.
- As imagens estáticas não estão copiadas no checkout de análise; devem ser preservadas pela árvore base Git. A verificação local aprova 91/92 contratos; a pendência é somente presença desses binários.
- Teste visual no navegador não foi concluído: o ambiente não possui Chromium, e o download retornou arquivo inválido. Não foi feita homologação em produção, impressão física nem venda real.

Aplicar `033_menu_autonomy_and_offers.sql` **antes** de publicar este código. A conexão Supabase atual respondeu `You do not have permission to perform this action` para o projeto Basso (`bseocjeghmjzrjadqnfd`); a listagem da conta mostra apenas VENDRA SISTEMA e Boteco Rei Banco. Este é um bloqueio diferente do erro anterior de requestState expirado. É necessário restabelecer acesso à conta/projeto Basso para executar a migration e liberar a publicação.

Nenhum novo telefone foi fornecido nas imagens. O telefone atual foi mantido; os novos campos permitem incluir os demais números sem alterar código. O próximo combo pode ser adicionado pelo painel.
