# Integração de leitura — Basso Fiscal

## Objetivo e separação de responsabilidades

Esta integração expõe **somente dados comerciais já persistidos** pelo sistema principal da La Forneria Basso. O projeto Basso Fiscal permanece separado e é o único responsável por Focus NFe, NFC-e, XML, DANFC-e, SEFAZ, NCM, CFOP, CSOSN, CEST, PIS, COFINS e demais regras tributárias.

A API não altera pedido, não grava status fiscal, não cria documento fiscal e não fornece credenciais do Supabase principal.

## Endpoint

```text
GET https://basso-seven.vercel.app/api/integrations/fiscal/orders
```

Não existem handlers `POST`, `PUT`, `PATCH` ou `DELETE` nesta rota.

## Autenticação server-to-server

No projeto principal da Basso, configurar somente no ambiente do servidor/Vercel:

```text
FISCAL_API_KEY=<segredo-forte-com-pelo-menos-32-caracteres>
```

No projeto **Basso Fiscal**, configurar:

```text
BASSO_ORDERS_API_URL=https://basso-seven.vercel.app/api/integrations/fiscal/orders
BASSO_ORDERS_API_KEY=<o-mesmo-segredo-de-FISCAL_API_KEY>
```

O projeto principal **não** deve possuir `BASSO_ORDERS_API_KEY`. O projeto Basso Fiscal **não** deve receber `SUPABASE_SERVICE_ROLE_KEY`, senha do banco, sessão de funcionário ou qualquer outra credencial interna da Basso.

Toda chamada deve enviar:

```http
Authorization: Bearer <FISCAL_API_KEY>
```

A comparação do segredo é feita por digest SHA-256 + `timingSafeEqual`; a chave nunca é retornada nem registrada em log. Chave ausente ou menor que 32 caracteres deixa a integração indisponível por configuração.

## Parâmetros

| Parâmetro | Tipo | Regra |
|---|---|---|
| `start` | `YYYY-MM-DD` | Início inclusivo no horário local da Basso |
| `end` | `YYYY-MM-DD` | Fim inclusivo no horário local da Basso |
| `payment` | `pix`, `cash`, `debit`, `credit`, `other` | Filtra o snapshot principal de forma de pagamento |
| `source` | `cardapio`, `pdv`, `mesa`, `ifood`, `99food`, `other` | Origem normalizada |
| `q` | texto, máx. 100 | Número exato do pedido ou `orders.id` exato |
| `status` | status elegível ou `all` | Padrão: `completed`; `cancelled` não é aceito |
| `limit` | inteiro 1–500 | Padrão: 100 |
| `cursor` | token opaco | Cursor retornado em `pagination.nextCursor` |

### Timezone

A operação usa `America/Sao_Paulo`.

Por exemplo:

```text
?start=2026-08-01&end=2026-08-01
```

representa o dia **01/08/2026 inteiro no horário de São Paulo**, e não um intervalo criado a partir de meia-noite UTC. O backend transforma o início em meia-noite local e o fim em meia-noite local exclusiva do dia seguinte.

Não existe limitação ao dia atual. Períodos históricos válidos podem ser consultados normalmente.

## Status reais confirmados

O banco principal utiliza:

```text
received
confirmed
preparing
ready
out_for_delivery
completed
cancelled
```

Por padrão, a integração retorna somente `completed`, pois é o estado final de venda da operação atual. `status=all` retorna estados não cancelados para reconciliação, mas **nunca** retorna pedido `cancelled` nem `deleted_at` preenchido.

## Channels reais confirmados

```text
own_delivery
pickup
counter
dine_in
ifood
99food
table_qr
```

Também existe `orders.order_origin`, persistido pelo fluxo atual (`web`, `counter`, `whatsapp`, `phone`, `table`, `marketplace` quando aplicável). A normalização usa channel + origem persistida:

| Condição real | `source` |
|---|---|
| `ifood` | `ifood` |
| `99food` | `99food` |
| `table_qr` / origem `table` | `mesa` |
| balcão/PDV, telefone ou WhatsApp operacional | `pdv` |
| `own_delivery`/`pickup` originados na web | `cardapio` |

### Fulfillment

| Channel | `fulfillment` |
|---|---|
| `own_delivery` | `delivery` |
| `pickup` | `pickup` |
| `counter` | `counter` |
| `dine_in`, `table_qr` | `dine_in` |
| marketplaces | `other` |

A modalidade do marketplace ainda não existe como coluna normalizada independente no banco principal. Por segurança arquitetural, esta API **não interpreta o payload bruto do marketplace para inventar uma modalidade**. O `channel` e `source` continuam disponíveis; quando o sistema principal normalizar essa informação no futuro, o contrato pode evoluir de forma explícita.

## Formas de pagamento reais confirmadas

O enum principal é:

```text
pix
cash
debit
credit
meal_voucher
food_voucher
```

O contrato externo normaliza:

| Interno | Externo |
|---|---|
| `pix` | `pix` |
| `cash` | `cash` |
| `debit` | `debit` |
| `credit` | `credit` |
| `meal_voucher` | `other` |
| `food_voucher` | `other` |

A tabela `payments` suporta múltiplos registros por pedido. A API busca todos os pagamentos de todos os pedidos da página em uma única consulta e preserva `method`, `status` e `amountCents`.

Se um pedido antigo não possuir linha em `payments`, a API cria **somente na resposta** um fallback a partir do snapshot confiável de `orders.payment_method`, `orders.payment_status` e `orders.total_cents`. Nada é gravado no banco.

## Valores e reconciliação comercial

Todos os valores retornados permanecem inteiros em centavos:

```json
{
  "itemsSubtotalCents": 10790,
  "unallocatedSubtotalCents": 0,
  "subtotalCents": 10790,
  "discountCents": 0,
  "deliveryFeeCents": 800,
  "totalCents": 11590
}
```

- `itemsSubtotalCents` é a soma de `quantity × unitPriceCents` dos itens ativos realmente persistidos em `order_items`.
- `unallocatedSubtotalCents` é `subtotalCents - itemsSubtotalCents`.
- `subtotalCents` continua sendo o snapshot comercial autoritativo do pedido.

Em pedidos normais, `unallocatedSubtotalCents` deve ser `0`.

Foi identificado em um pedido histórico real do iFood que uma customização aninhada de terceiro nível não foi materializada integralmente em `order_items`, apesar de estar contemplada no subtotal autoritativo do pedido. Nesses casos, a API **não inventa item sintético, não altera o pedido e não cria regra fiscal**: ela expõe a diferença em `unallocatedSubtotalCents` para que o Basso Fiscal consiga detectar e tratar a reconciliação comercial de forma explícita.

Esse campo pode ser positivo ou negativo em dados históricos/externos e não representa, por si só, taxa, desconto ou classificação tributária.

Itens também utilizam `unitPriceCents` e `totalCents`. Não há cálculo monetário com ponto flutuante.

## Itens e pizza meio a meio

A consulta traz os itens em lote a partir de `order_items` e preserva `selection` exatamente como foi persistido. Itens cancelados individualmente (`production_status = cancelled`) não são devolvidos, porque o próprio sistema principal os exclui do recálculo do subtotal.

A API não interpreta seleção de pizza como regra tributária. `productId`, nome, quantidade, preço e `selection` são apenas snapshots comerciais.

## Paginação

A listagem é ordenada pelo número interno único em ordem decrescente. O banco possui constraint `UNIQUE (number)`. O número **não é a identidade fiscal**; ele é usado apenas para uma paginação estável e eficiente. `externalId` é sempre `orders.id`.

Exemplo:

```json
{
  "pagination": {
    "hasMore": true,
    "nextCursor": "eyJ2IjoxLCJsYXN0TnVtYmVyIjoiMTAwMDAifQ"
  }
}
```

Reenvie o cursor recebido junto dos mesmos filtros para buscar a página seguinte.

## Contrato de resposta

```json
{
  "orders": [
    {
      "id": "ord_xxx",
      "externalId": "ord_xxx",
      "number": 1051,
      "orderedAt": "2026-08-01T22:42:00.000Z",
      "customer": { "name": "João" },
      "customerTaxId": null,
      "channel": "own_delivery",
      "source": "cardapio",
      "fulfillment": "delivery",
      "status": "completed",
      "paymentStatus": "paid",
      "paymentMethod": "pix",
      "itemsSubtotalCents": 10790,
      "unallocatedSubtotalCents": 0,
      "subtotalCents": 10790,
      "discountCents": 0,
      "deliveryFeeCents": 800,
      "totalCents": 11590,
      "couponCode": null,
      "items": [
        {
          "id": "item_xxx",
          "productId": "produto_xxx",
          "sku": "produto_xxx",
          "kind": "product",
          "name": "Produto",
          "quantity": 1,
          "unitPriceCents": 10790,
          "totalCents": 10790,
          "selection": {},
          "sector": "bar"
        }
      ],
      "payments": [
        {
          "method": "pix",
          "status": "paid",
          "amountCents": 11590
        }
      ]
    }
  ],
  "pagination": {
    "hasMore": false,
    "nextCursor": null
  }
}
```

`customerTaxId` permanece `null` enquanto o sistema principal não coletar documento do consumidor. Nenhum documento é inventado.

## Privacidade

A query de `orders` seleciona apenas os campos necessários ao contrato. A resposta não contém:

- telefone do cliente;
- endereço;
- `external_payload` de marketplace;
- `source_idempotency_key`;
- tracking token/hash;
- access token de pedido;
- dados ou IDs de funcionários;
- provider transaction ID, NSU ou authorization code;
- audit logs;
- cookies, IPs ou sessões;
- credenciais Supabase.

## Erros

Sem Bearer ou Bearer inválido:

```http
401 Unauthorized
```

```json
{ "error": "Não autorizado." }
```

Filtros, data, range ou cursor inválidos:

```http
400 Bad Request
```

```json
{ "error": "Período inválido." }
```

Chave fiscal ausente/insegura no servidor:

```http
503 Service Unavailable
```

```json
{ "error": "Integração fiscal não configurada." }
```

Falha inesperada de consulta:

```http
500 Internal Server Error
```

```json
{ "error": "Falha ao consultar pedidos." }
```

Todas as respostas usam `Cache-Control: no-store`. A rota não publica `Access-Control-Allow-Origin`; ela foi desenhada para comunicação server-to-server.

## cURL

```bash
curl \
  -H "Authorization: Bearer $FISCAL_API_KEY" \
  "https://basso-seven.vercel.app/api/integrations/fiscal/orders?start=2026-08-01&end=2026-08-31&limit=100"
```

Filtrar PIX:

```bash
curl \
  -H "Authorization: Bearer $FISCAL_API_KEY" \
  "https://basso-seven.vercel.app/api/integrations/fiscal/orders?start=2026-08-01&end=2026-08-31&payment=pix"
```

Buscar pedido por número:

```bash
curl \
  -H "Authorization: Bearer $FISCAL_API_KEY" \
  "https://basso-seven.vercel.app/api/integrations/fiscal/orders?q=1051"
```
