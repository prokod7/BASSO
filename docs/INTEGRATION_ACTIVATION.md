# Ativação de integrações externas

## iFood — somente pedidos

A integração da La Forneria Basso usa apenas `Order`, `Events` e `Merchant`. Não sincroniza catálogo, estoque, promoções, financeiro ou conciliação.

Variáveis obrigatórias:

- `IFOOD_CLIENT_ID`
- `IFOOD_CLIENT_SECRET`
- `IFOOD_MERCHANT_ID`
- `IFOOD_BASE_URL=https://merchant-api.ifood.com.br`
- `MARKETPLACE_AUTO_ACCEPT=false`

Webhook oficial:

```text
https://SEU-DOMINIO/api/integrations/ifood/webhook
```

O endpoint valida `X-IFood-Signature` com HMAC SHA-256 usando o `clientSecret`, responde `KEEPALIVE`, deduplica eventos pelo ID e coloca o processamento em fila durável. O cron protegido é a contingência para falhas transitórias.

Fluxo implementado:

- recebe o evento e consulta `GET /orders/{id}`;
- grava pedido e itens no Supabase sem criar cliente no CRM;
- cria alerta interno, toca aviso no painel e gera trabalhos de impressão por setor;
- confirma, inicia preparo, marca pronto e despacha entrega própria;
- consulta os motivos oficiais antes de solicitar cancelamento;
- sincroniza eventos de confirmado, preparo, pronto, despacho, conclusão e cancelamento;
- mantém histórico, auditoria, deduplicação e retentativa.

Consulte [`IFOOD_SETUP.md`](IFOOD_SETUP.md) para ativar a loja de teste e depois a produção.

## 99Food

Variáveis: `FOOD99_CLIENT_ID`, `FOOD99_CLIENT_SECRET`, `FOOD99_BASE_URL`, `FOOD99_WEBHOOK_SECRET`.

O endpoint fica vazio por padrão para impedir chamadas a uma URL presumida. Preencha somente após o fornecedor fornecer ambiente, credenciais e contrato de payload.

## Rede

Variáveis: `REDE_PV`, `REDE_TOKEN`, `REDE_BASE_URL`, `REDE_WEBHOOK_SECRET`.

- confirmar produto/API/SmartPOS contratado;
- cadastrar terminais e vínculo com garçom/PDV;
- homologar débito, crédito, refeição e alimentação;
- testar aprovação, recusa, timeout, cancelamento e estorno.

## OneSignal e e-mail

Variáveis: `NEXT_PUBLIC_ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, `RESEND_API_KEY`, `CAMPAIGN_FROM_EMAIL`.

Push/e-mail exigem consentimento. Clientes de marketplace não são elegíveis. WhatsApp permanece manual.

## Mapa

Leaflet e OpenStreetMap não exigem API paga de rota. O módulo não calcula rota nem previsão automática.
