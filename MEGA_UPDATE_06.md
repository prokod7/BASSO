# PedidoPro — Mega Update 06

## Integration Ready + 99Food Contract-First

Versão 6.0.0 da instalação La Forneria Basso.

Este update prepara o núcleo do PedidoPro para 99Food, rastreamento de motoboys e Laranjinha Smart sem alterar o contrato já utilizado pelo adaptador do iFood.

## 99Food

Contexto de homologação preparado:

- aplicação: `PedidoPro 99Food Teste`;
- ambiente: `test`;
- AppShopID: `basso_teste_001`;
- webhook: `https://basso-seven.vercel.app/api/integrations/99food/webhook`;
- credenciais somente por variáveis de ambiente;
- `integration_events` como fila idempotente;
- correlação, redaction de segredos, retry e dead-letter preservados;
- tela própria de diagnóstico, configuração e logs.

### Segurança contra implementação inventada

O projeto anterior possuía suposições de endpoints/headers 99Food. Elas foram removidas. Como a documentação técnica oficial da Plataforma Aberta 99Food não está disponível dentro deste ambiente, as chamadas externas permanecem bloqueadas pelo `IntegrationDocumentationRequiredError`.

A rota do webhook existe e pode ser verificada por `GET`, porém o `POST` retorna `503 OFFICIAL_DOCUMENTATION_REQUIRED` até que autenticação, assinatura, payloads e endpoints oficiais sejam fornecidos e implementados literalmente.

Consulte `docs/99FOOD_OFFICIAL_DOCS_NEEDED.md`.

## Rastreamento de motoboys

A fundação agora separa dois níveis:

1. **interno da pizzaria** — continua durante todo o turno ativo do motoboy, inclusive depois de concluir uma entrega;
2. **cliente** — token temporário vinculado exclusivamente ao pedido e invalidado ao concluir/cancelar a entrega.

A migration 016 adiciona `driver_shifts`, telemetria GPS, histórico curto e controle de visibilidade do cliente. O PWA do motoboy pode continuar enviando posição sem `order_id` enquanto houver turno ativo.

## Laranjinha Smart / app do garçom

Foi criada a fundação de dispositivos `waiter_smartpos`, metadados de terminal e campos de transação para NSU/autorização futura. A tela do garçom pode registrar a maquininha como terminal SmartPOS.

Nenhuma API REST da Rede é presumida. Pagamentos na própria Laranjinha permanecem bloqueados até o Itaú/Rede disponibilizar o SDK/App2App e o processo de certificação.

## Migration

Em instalações atualizadas até 015, execute somente:

`supabase/migrations/016_integration_ready_99food_tracking_smartpos.sql`

## Variáveis 99Food preparadas

```env
FOOD99_ENVIRONMENT=test
FOOD99_APP_ID=
FOOD99_APP_SECRET=
FOOD99_SHOP_ID=
FOOD99_SHOP_TOKEN=
FOOD99_APP_SHOP_ID=basso_teste_001
```

Nenhuma URL, webhook secret ou header extra deve ser criado por suposição. Se a documentação oficial exigir outra variável, ela será adicionada no patch de ativação.
