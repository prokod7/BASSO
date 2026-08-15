# Mega Update 06 — inspeção e arquivos afetados

## Inspecionado antes da alteração

- adaptador funcional do iFood;
- adaptadores antigos de 99Food/Rede;
- webhook genérico;
- worker de `integration_events`;
- RPCs de fila e idempotência;
- persistência transacional de pedidos marketplace;
- status de pedidos e fila outbound;
- central de integrações/diagnóstico;
- tabelas `orders`, `order_items`, `payments`, `integration_events`, `integration_connections`;
- delivery, motoboys, tokens públicos e localização;
- garçom, mesas/comandas e permissões;
- migrations 001–015.

## Pontos preservados

- `src/lib/integrations/ifood.ts` permanece com o mesmo conteúdo da base Mega Update 05;
- as rotas e ENV existentes do iFood não foram renomeadas;
- `integration_events` continua sendo a fila central;
- idempotência existente `provider + event_id` e `channel + external_id/source_idempotency_key` é reutilizada.

## Arquivos novos principais

- `src/lib/integrations/core/*`
- `src/lib/integrations/food99/*`
- `src/lib/integrations/rede/official-contract.ts`
- `src/app/api/integrations/99food/webhook/route.ts`
- `src/app/api/integrations/99food/status/route.ts`
- `src/app/api/integrations/99food/logs/route.ts`
- `src/app/painel/integracoes/99food/page.tsx`
- `src/app/api/drivers/shifts/start/route.ts`
- `src/app/api/drivers/shifts/end/route.ts`
- `src/app/api/devices/register/route.ts`
- `supabase/migrations/016_integration_ready_99food_tracking_smartpos.sql`
- `tests/food99-contract.test.ts`
- `tests/integration-ready.test.ts`

## Arquivos alterados principais

- `middleware.ts`
- `.env.example`
- `package.json`
- `src/lib/integrations/food99.ts`
- `src/lib/integrations/rede.ts`
- `src/lib/workers/marketplace.ts`
- `src/app/api/webhooks/[provider]/route.ts`
- `src/app/api/integrations/health/route.ts`
- `src/app/api/drivers/[id]/location/route.ts`
- `src/app/api/operational-snapshot/route.ts`
- `src/app/painel/integracoes/page.tsx`
- `src/app/painel/motoboy/page.tsx`
- `src/app/painel/garcom/page.tsx`
- `src/lib/demo-store.ts`
- `src/types/index.ts`
- `scripts/check-migrations.mjs`
- `scripts/verify-project.mjs`
- documentação/README.
