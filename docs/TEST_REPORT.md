# Relatório de verificação estática

Gerado em: 2026-08-06T06:40:57.198Z

Resultado: **70/70 verificações aprovadas**.

| Verificação | Resultado | Detalhe |
|---|---:|---|
| 42 pizzas tradicionais | APROVADO | — |
| 11 pizzas premium | APROVADO | — |
| 11 pizzas doces | APROVADO | — |
| 29 bebidas | APROVADO | — |
| 20 adicionais | APROVADO | — |
| 1 combo oficial | APROVADO | — |
| Sobremesa com 2 variações | APROVADO | — |
| Bordas desativadas | APROVADO | — |
| Broto meio a meio desativado | APROVADO | — |
| Adicionais: máximo 5 unidades | APROVADO | — |
| Adicionais: máximo 2 do mesmo | APROVADO | — |
| Observações: máximo 500 caracteres | APROVADO | — |
| Fidelidade: 10 pontos / saldo 15 | APROVADO | — |
| Recompensa apenas Mozzarella/Calabresa Tradicional | APROVADO | — |
| 15 mesas | APROVADO | — |
| 10 mesas de 5 lugares | APROVADO | — |
| 5 mesas de 2 lugares | APROVADO | — |
| IDs únicos em cada cadastro | APROVADO | — |
| Preços em centavos inteiros | APROVADO | — |
| Ingredientes cadastrados em todos os sabores | APROVADO | — |
| Todos os assets referenciados existem | APROVADO | — |
| Telas públicas e operacionais presentes | APROVADO | — |
| Nenhum componente de seleção de borda | APROVADO | — |
| Validação explícita contra bordas | APROVADO | — |
| Migrações SQL 001–014 presentes | APROVADO | 001_core_schema.sql, 002_official_catalog_seed.sql, 003_operational_functions.sql, 004_integrations_and_public_access.sql, 005_workers_and_queue_claims.sql, 006_reviews_and_customer_experience.sql, 007_management_finance_crm_and_settings.sql, 008_loyalty_reward_authorizations.sql, 009_internal_orders_and_tabs.sql, 010_salon_groups_and_cash_payments.sql, 011_public_table_qr_and_order_hardening.sql, 012_runtime_menu_management.sql, 013_admin_control_center.sql, 014_autonomy_operations_and_control.sql |
| RLS habilitado | APROVADO | — |
| Auditoria imutável | APROVADO | — |
| Chaves de idempotência | APROVADO | — |
| Webhook e filas com deduplicação | APROVADO | — |
| Restrição de Broto no banco | APROVADO | — |
| Restrição de borda no banco | APROVADO | — |
| Estoque somente em produtos rastreados | APROVADO | — |
| Fidelidade limitada a 15 | APROVADO | — |
| Marketplace sem perfil no CRM | APROVADO | — |
| QR de mesa abre/reutiliza comanda de forma atômica | APROVADO | — |
| QR não cria perfil no CRM | APROVADO | — |
| Pagamentos parciais fecham comanda e liberam mesa | APROVADO | — |
| Junção e separação de mesas | APROVADO | — |
| Recompensa exige autorização transacional | APROVADO | — |
| Checkout preserva mesa e comanda do QR | APROVADO | — |
| QR não cobra nem fecha automaticamente | APROVADO | — |
| API pública aceita somente delivery, retirada e QR | APROVADO | — |
| Recompensa bloqueada no checkout público | APROVADO | — |
| APIs de gestão financeira e CRM presentes | APROVADO | — |
| Saúde e retentativa de integrações presentes | APROVADO | — |
| Fluxos transacionais de salão presentes | APROVADO | — |
| Mega Update administrativo presente | APROVADO | — |
| Central da comanda com seis áreas | APROVADO | — |
| Pedido administrável com notas e ocorrências | APROVADO | — |
| Comunicação manual auditável | APROVADO | — |
| Pagamento manual transacional | APROVADO | — |
| Status controlado exige pagamento e motivo | APROVADO | — |
| Estado operacional da loja administrável | APROVADO | — |
| Permissões específicas no backend | APROVADO | — |
| Cardápio editável sem acessar banco | APROVADO | — |
| Delivery operável sem mapa | APROVADO | — |
| Mega Update 04 de autonomia presente | APROVADO | — |
| Rotinas guiadas de abertura e fechamento | APROVADO | — |
| Tarefas e aprovações persistentes | APROVADO | — |
| Expedição auditável | APROVADO | — |
| Perfis de impressão administráveis | APROVADO | — |
| Compras atualizam estoque transacionalmente | APROVADO | — |
| Exportação operacional protegida | APROVADO | — |
| Gate de qualidade no GitHub | APROVADO | — |
| Modelos de comunicação administráveis | APROVADO | — |
| PWA com ícones 192 e 512 | APROVADO | — |
| Service worker presente | APROVADO | — |
| Bridge de impressão presente | APROVADO | — |
| Cron de filas preservado | APROVADO | — |
| Nenhum segredo evidente versionado | APROVADO | — |

## Limite do ambiente desta entrega

O registro acima valida dados, arquivos, regras críticas, rotas, assets, migrações e contratos de segurança sem depender da rede. A instalação das dependências e o `next build` devem ser executados no ambiente de implantação com acesso ao registro npm. Integrações externas exigem credenciais e homologação dos fornecedores.
