# Ativação de integrações externas

## iFood

O adaptador existente foi preservado no Mega Update 06. Use as variáveis já adotadas pela instalação:

```env
IFOOD_CLIENT_ID=
IFOOD_CLIENT_SECRET=
IFOOD_BASE_URL=https://merchant-api.ifood.com.br
IFOOD_WEBHOOK_SECRET=
```

Faça qualquer alteração futura somente a partir do contrato oficial/homologação do aplicativo já existente.

## 99Food — Sandbox Basso

Contexto:

- app: `PedidoPro 99Food Teste`;
- ambiente: teste;
- AppShopID: `basso_teste_001`;
- webhook cadastrado: `https://basso-seven.vercel.app/api/integrations/99food/webhook`.

Variáveis preparadas:

```env
FOOD99_ENVIRONMENT=test
FOOD99_APP_ID=
FOOD99_APP_SECRET=
FOOD99_SHOP_ID=
FOOD99_SHOP_TOKEN=
FOOD99_APP_SHOP_ID=basso_teste_001
```

A rota existe, mas o processamento externo fica bloqueado até a aplicação literal da documentação oficial. Isso é proposital. Consulte `99FOOD_OFFICIAL_DOCS_NEEDED.md`.

Depois do patch de ativação oficial, o fluxo de teste será:

1. adicionar ENV na Vercel;
2. redeploy;
3. abrir `/painel/integracoes/99food`;
4. clicar **Testar conexão**;
5. confirmar autenticação/loja/webhook;
6. no Sandbox 99Food, clicar **Criar pedido**;
7. confirmar um único pedido no painel/KDS;
8. reenviar o mesmo evento e confirmar idempotência;
9. testar finalização;
10. testar cancelamento.

## Rastreio de motoboy

Não exige fornecedor externo na base. O PedidoPro usa GPS do navegador/PWA + Supabase + mapa OpenStreetMap/Leaflet.

O modelo é separado:

- turno ativo: localização interna para a pizzaria;
- entrega ativa: token adicional e temporário para o cliente;
- pedido entregue: cliente perde acesso imediatamente;
- turno continua: pizzaria continua vendo a última/localização atual do motoboy;
- fim do turno: rastreio interno é encerrado.

É necessário HTTPS, permissão de geolocalização, internet e PWA/navegador em execução. Rastreamento confiável em background precisa ser validado nos aparelhos reais, principalmente iOS.

## Laranjinha Smart / Rede

O objetivo é o app do garçom rodar na Laranjinha Smart e iniciar pagamento na mesma máquina. A fundação SmartPOS está pronta, mas nenhum endpoint REST da Rede é usado por suposição.

A ativação depende de:

- aprovação KYP/Conexão Itaú;
- SDK/App2App oficial da Laranjinha Smart Store;
- documentação de intents/callbacks;
- identificação do terminal;
- retornos de pagamento, NSU, autorização, cancelamento/estorno;
- regras de certificação/publicação.

Até isso chegar, o pagamento SmartPOS permanece explicitamente desabilitado.

## OneSignal, Resend e Print Bridge

Use as variáveis de `.env.example`. WhatsApp permanece manual. Print Bridge usa agente local e chave compartilhada; não simule impressão confirmada sem retorno do agente.
