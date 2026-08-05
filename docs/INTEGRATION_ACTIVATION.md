# Ativação de integrações externas

Os adaptadores foram construídos com configuração por ambiente, assinatura de webhook, deduplicação, mapeamento, logs, retentativa e diagnóstico. As URLs e formatos finais precisam ser confirmados na documentação e homologação vigentes de cada contrato.

## iFood

Variáveis: `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET`, `IFOOD_BASE_URL`, `IFOOD_WEBHOOK_SECRET`.

Checklist:

- liberar aplicação/merchant no portal parceiro;
- registrar webhook HTTPS;
- confirmar cabeçalhos de assinatura e identificador de evento;
- mapear produtos, sabores, adicionais, pagamentos e status;
- testar aceite, preparo, pronto, despacho e cancelamento;
- confirmar política de polling caso o contrato não use webhook direto;
- validar conciliação e taxas.

## 99Food

Variáveis: `FOOD99_CLIENT_ID`, `FOOD99_CLIENT_SECRET`, `FOOD99_BASE_URL`, `FOOD99_WEBHOOK_SECRET`.

O endpoint fica vazio por padrão para impedir chamadas a uma URL presumida. Preencha somente após o fornecedor fornecer ambiente, credenciais e contrato de payload. Faça a mesma bateria de mapeamento, status, cancelamento, conciliação e duplicidade.

## Rede

Variáveis: `REDE_PV`, `REDE_TOKEN`, `REDE_BASE_URL`, `REDE_WEBHOOK_SECRET`.

- confirmar produto/API/SmartPOS contratado;
- cadastrar terminais e vínculo com garçom/PDV;
- homologar débito, crédito, refeição e alimentação;
- testar aprovação, recusa, timeout, cancelamento e estorno;
- conferir TID, código de autorização, terminal e conciliação;
- manter registro manual auditado quando o terminal estiver indisponível.

## OneSignal e e-mail

Variáveis: `NEXT_PUBLIC_ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, `RESEND_API_KEY`, `CAMPAIGN_FROM_EMAIL`.

Push/e-mail exigem consentimento. Clientes de marketplace não são elegíveis. WhatsApp permanece manual e não é processado pela fila automática.

## Mapa

Leaflet/MapLibre e cartografia OpenStreetMap não exigem API paga de rota. O módulo não calcula rota nem previsão automática. Para volume elevado, adote provedor de tiles compatível com a política de uso; não sobrecarregue o servidor público do OpenStreetMap.
