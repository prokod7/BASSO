# Ativação do iFood — La Forneria Basso

Esta entrega integra somente o ciclo operacional de pedidos. Não existe sincronização de catálogo, estoque, preço, promoção, financeiro ou conciliação.

## 1. Variáveis na Vercel

Abra o projeto da Basso em **Settings → Environment Variables** e cadastre, em `Production`, `Preview` e `Development` conforme o ambiente:

```env
IFOOD_CLIENT_ID=cole_o_clientId_do_portal
IFOOD_CLIENT_SECRET=cole_o_clientSecret_do_portal
IFOOD_MERCHANT_ID=cole_o_id_da_loja
IFOOD_BASE_URL=https://merchant-api.ifood.com.br
MARKETPLACE_AUTO_ACCEPT=false
```

Para o aplicativo centralizado de teste usado nesta implantação, o ID da loja exibido no Portal é:

```text
26c3dfba-5592-44d4-925d-19ef2b290cac
```

O `clientSecret` nunca deve entrar no GitHub, em prints ou em variáveis `NEXT_PUBLIC_*`.

Depois de cadastrar as variáveis, faça um novo deploy.

## 2. Testar autenticação

Entre no painel da Basso como gestor:

1. Abra **Integrações e diagnóstico**.
2. No card do iFood, clique em **Testar**.
3. O resultado deve mostrar a loja autenticada.

Se aparecer `401`, confira `clientId` e `clientSecret`. Se aparecer falta de loja, confira `IFOOD_MERCHANT_ID` e a permissão do merchant no Portal.

## 3. Ativar o webhook no Portal iFood

No aplicativo centralizado de teste:

1. Abra a aba **Webhook**.
2. Ative o status.
3. Em **URL do webhook**, coloque:

```text
https://SEU-DOMINIO/api/integrations/ifood/webhook
```

4. Em **Categoria de pedidos**, deixe somente `FOOD`.
5. Clique em **Testar conexão**.
6. Com o teste aprovado, clique em **Salvar**.

O teste só passa depois do deploy com Supabase e `IFOOD_CLIENT_SECRET` configurados.

## 4. Gerar o pedido de teste

1. No menu lateral do Portal iFood, abra **Pedidos de teste**.
2. Gere um pedido `FOOD` para a loja de teste.
3. Confira no PedidoPro:
   - entrada na coluna **Recebidos**;
   - alerta e notificação;
   - itens e observações na cozinha;
   - trabalhos de impressão na fila.
4. Abra o pedido e avance, uma etapa por vez:
   - **Confirmado**;
   - **Em preparo**;
   - **Pronto**;
   - **Saiu para entrega**, somente quando a entrega for da pizzaria;
   - **Concluído**.
5. Gere outro pedido e valide o cancelamento selecionando primeiro o motivo oficial retornado pelo iFood.

## 5. Retentativa e cron

Mantenha `CRON_SECRET` configurado. O endpoint `/api/cron/process-queues` reprocessa falhas transitórias. A impressão física também depende do Print Bridge local ativo.

## 6. Produção

Depois dos testes e da homologação:

1. Crie ou selecione o aplicativo de produção centralizado.
2. Solicite acesso ao CNPJ da La Forneria Basso.
3. O proprietário aprova no Portal do Parceiro.
4. Troque na Vercel o `clientId`, `clientSecret` e `merchantId` de teste pelos de produção.
5. Cadastre a mesma URL de webhook no aplicativo de produção.
6. Faça um pedido real de valor baixo e valide o ciclo completo antes da operação normal.
