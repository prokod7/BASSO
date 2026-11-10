# Relatório de verificação estática

Gerado em: 2026-11-10T22:49:15.243Z

Resultado: **92/92 verificações aprovadas**.

| Verificação | Resultado | Detalhe |
|---|---:|---|
| 42 pizzas tradicionais | APROVADO | — |
| 11 pizzas premium | APROVADO | — |
| 11 pizzas doces | APROVADO | — |
| 32 bebidas base (catálogo atualizado pela migration 034) | APROVADO | — |
| 20 adicionais | APROVADO | — |
| Combo oficial R$ 79,99 | APROVADO | — |
| Bordas desativadas | APROVADO | — |
| Broto sem meio a meio | APROVADO | — |
| Máximo de 5 adicionais | APROVADO | — |
| Máximo de 2 unidades do mesmo adicional | APROVADO | — |
| Fidelidade 10 pedidos / saldo 15 | APROVADO | — |
| 15 mesas | APROVADO | — |
| IDs únicos nos cadastros estáticos | APROVADO | — |
| Preços em centavos inteiros | APROVADO | — |
| Ingredientes cadastrados | APROVADO | — |
| Assets estáticos referenciados existem | APROVADO | — |
| Telas públicas e operacionais críticas presentes | APROVADO | — |
| Nenhum seletor de borda reintroduzido | APROVADO | — |
| Validação explícita contra bordas | APROVADO | — |
| Migrações SQL 001–032 presentes | APROVADO | 001_core_schema.sql, 002_official_catalog_seed.sql, 003_operational_functions.sql, 004_integrations_and_public_access.sql, 005_workers_and_queue_claims.sql, 006_reviews_and_customer_experience.sql, 007_management_finance_crm_and_settings.sql, 008_loyalty_reward_authorizations.sql, 009_internal_orders_and_tabs.sql, 010_salon_groups_and_cash_payments.sql, 011_public_table_qr_and_order_hardening.sql, 012_runtime_menu_management.sql, 013_admin_control_center.sql, 014_autonomy_operations_and_control.sql, 015_operational_maturity_and_reliability.sql, 016_integration_ready_99food_tracking_smartpos.sql, 017_production_final_hardening.sql, 018_final_operation_patch.sql, 019_final_homologation.sql, 020_production_security_and_performance_hardening.sql, 021_sweet_pizza_options_and_official_promo.sql, 022_print_delivery_location_fixes.sql, 023_operational_consistency_and_security.sql, 024_catalog_admin_and_product_media.sql, 025_delivery_handoff_tracking_and_print.sql, 026_customer_tracking_link.sql, 027_delivery_verification_fk_indexes.sql, 028_delivery_city_district_selection.sql, 029_final_waiter_payments_promotions.sql, 030_promotion_actor_fk_indexes.sql, 031_realtime_go_live_audit.sql, 032_audit_operation_integrity.sql, 033_menu_autonomy_and_offers.sql, 034_saipos_prices_and_beverages.sql, 035_fix_delivery_random_bytes_schema.sql, 036_fix_private_tracking_crypto_schema.sql, 037_complete_order_without_auto_payment.sql, 038_salon_receipts_daily_numbers.sql, 039_direct_order_completion.sql, 040_salon_drinks_catalog.sql, 041_configurable_restaurant_tables.sql, 042_restaurant_table_available_privileges.sql, 043_whatsapp_bot.sql, 044_whatsapp_auto_reply_echo.sql, 045_order_payment_edit.sql, 046_whatsapp_wait_times.sql |
| RLS habilitado | APROVADO | — |
| Auditoria imutável | APROVADO | — |
| Idempotência persistente | APROVADO | — |
| Filas com SKIP LOCKED | APROVADO | — |
| Restrição de Broto no banco | APROVADO | — |
| Restrição de borda no banco | APROVADO | — |
| Recompensa transacional | APROVADO | — |
| RPC de impressão fechado a browser roles | APROVADO | — |
| MU14 cria arquivamento sem destruir histórico | APROVADO | — |
| MU14 cria bucket de imagens | APROVADO | — |
| Produto vinculado à categoria | APROVADO | — |
| MU16 torna cidade explícita na cobertura | APROVADO | — |
| Checkout mantém idempotência | APROVADO | — |
| API pública limita canais | APROVADO | — |
| Pedido público valida agenda oficial | APROVADO | — |
| Delivery público bloqueia cobertura ausente | APROVADO | — |
| Recompensa pública bloqueada | APROVADO | — |
| Checkout busca bairro atendido (cidade vem do bairro, sem CEP) | APROVADO | — |
| GPS tenta casar localização com cobertura | APROVADO | — |
| Frete autoritativo usa cidade + bairro | APROVADO | — |
| Endpoint público expõe somente cobertura ativa | APROVADO | — |
| APIs do MU14 presentes | APROVADO | — |
| Admin cria produtos | APROVADO | — |
| Admin cria categorias | APROVADO | — |
| Admin pausa e remove sem apagar histórico | APROVADO | — |
| Upload por arquivo substitui URL manual | APROVADO | — |
| Upload limitado e server-side | APROVADO | — |
| Upload aceita formatos seguros | APROVADO | — |
| Runtime carrega categorias e ignora arquivados | APROVADO | — |
| Categoria pausada bloqueia venda | APROVADO | — |
| Cardápio público recebe categorias runtime | APROVADO | — |
| Categorias criadas aparecem na home | APROVADO | — |
| PDV oferece Entrega explicitamente | APROVADO | — |
| PDV usa cardápio runtime | APROVADO | — |
| PDV calcula taxa de entrega antes de finalizar | APROVADO | — |
| PDV exige bairro pesquisável e endereço para entrega | APROVADO | — |
| PDV usa cobertura cidade + bairro | APROVADO | — |
| PDV finaliza pelo backend autoritativo | APROVADO | — |
| Cidades e bairros podem ser adicionados | APROVADO | — |
| Cidades e bairros podem ser editados | APROVADO | — |
| Bairros podem ser pausados e reativados | APROVADO | — |
| Bairros podem ser arquivados | APROVADO | — |
| Impressão manual vai para a fila da estação automática | APROVADO | — |
| Comprovante térmico possui layout de 80 mm | APROVADO | — |
| Comanda de entrega replica estrutura operacional | APROVADO | — |
| Comanda da cozinha é separada e sem financeiro | APROVADO | — |
| Comanda imprime QR de retirada | APROVADO | — |
| Print Bridge permanece opcional | APROVADO | — |
| MU15 de rastreio e validação presente | APROVADO | — |
| Retirada exige QR ou código e motoboy atribuído | APROVADO | — |
| Entrega exige código privado do cliente | APROVADO | — |
| Retirada validada e conclusão operacional disponível a todos os perfis | APROVADO | — |
| Tentativas inválidas possuem bloqueio | APROVADO | — |
| Token de rastreio é preservado fora do navegador | APROVADO | — |
| Tracking token não tem SELECT direto para browser | APROVADO | — |
| Pagamento na entrega passa pela transação oficial | APROVADO | — |
| PWA mantém GPS durante entrega | APROVADO | — |
| Diagnóstico alinhado ao MU18 / migration 32 | APROVADO | — |
| Diagnóstico consulta publicação Realtime real | APROVADO | — |
| Realtime: publica tabelas operacionais | APROVADO | — |
| Realtime: RPC restrita ao backend | APROVADO | — |
| Diagnóstico valida Print Bridge real | APROVADO | — |
| Controle de concorrência de pedidos | APROVADO | — |
| Inventário assistido | APROVADO | — |
| Troca obrigatória de senha | APROVADO | — |
| Feature flags persistentes | APROVADO | — |
| 99Food sem endpoints inventados | APROVADO | — |
| Gate de qualidade executa typecheck e build | APROVADO | — |
| PWA com ícones 192 e 512 | APROVADO | — |
| Service worker presente | APROVADO | — |
| Cron de filas preservado | APROVADO | — |
| Nenhum segredo evidente versionado | APROVADO | — |

## Limite da verificação estática

Este relatório valida contratos críticos do projeto. TypeScript, testes unitários e build de produção são executados em etapas separadas do Quality Gate.
