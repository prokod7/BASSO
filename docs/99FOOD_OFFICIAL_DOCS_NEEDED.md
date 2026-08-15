# 99Food — documentação oficial necessária para ativação

A infraestrutura está pronta, mas o contrato HTTP não será inventado. Para transformar o estado `awaiting_official_contract` em `operational`, forneça capturas/PDF/exportação das páginas oficiais da Plataforma Aberta 99Food que mostrem exatamente:

1. **Autenticação**
   - URL/endpoint oficial;
   - método HTTP;
   - headers;
   - body/parâmetros;
   - formato do token;
   - expiração e renovação.

2. **Webhook / callback**
   - headers enviados pela 99Food;
   - algoritmo de assinatura/autenticidade;
   - composição exata da string assinada, se houver;
   - encoding/formato da assinatura;
   - política de timestamp/replay, se houver;
   - códigos HTTP que representam ACK e retry.

3. **Eventos do Sandbox**
   - payload completo de “Criar pedido”;
   - payload de “Aviso de pedido finalizado”;
   - payload de “Aviso de cancelamento de pedido”;
   - campo de event ID/idempotência;
   - campo que identifica o pedido.

4. **Detalhes do pedido**
   - endpoint de consulta;
   - método;
   - path/query/body;
   - resposta completa;
   - cliente, telefone, endereço, entrega, pagamento, itens, complementos e observações.

5. **Aceite e status**
   - endpoint/payload de confirmação/aceite;
   - estados oficiais e transições aceitas;
   - endpoints/payloads para preparo, pronto, despacho/entrega e conclusão.

6. **Cancelamento**
   - endpoint para solicitar cancelamento;
   - códigos/motivos permitidos;
   - estados em que o cancelamento é permitido;
   - resposta de aceitação/rejeição.

7. **Valores monetários**
   - unidade usada pela API (centavos, decimal, string etc.);
   - regras para subtotal, desconto, taxa e total.

8. **Itens / `APIItemID`**
   - localização do campo no payload;
   - diferença entre item da API, item do catálogo e complemento;
   - regras do Sandbox para `APIItemID`.

## O que NÃO precisa ser enviado

Não envie APP Secret, Shop Token ou qualquer segredo em print/documento. Esses valores devem ir somente para as variáveis de ambiente da Vercel.
