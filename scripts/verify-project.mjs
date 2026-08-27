import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
const catalog = JSON.parse(read("src/data/catalog.json"));
const results = [];
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok, detail });
  if (!ok) process.exitCode = 1;
}

check("42 pizzas tradicionais", catalog.flavors.filter(x => x.category === "traditional").length === 42);
check("11 pizzas premium", catalog.flavors.filter(x => x.category === "premium").length === 11);
check("11 pizzas doces", catalog.flavors.filter(x => x.category === "sweet").length === 11);
check("29 bebidas base", catalog.beverages.length === 29);
check("20 adicionais", catalog.addons.length === 20);
check("1 combo oficial", catalog.combo?.price === 7999);
check("Sobremesa com 2 variações", catalog.desserts.length === 2);
check("Bordas desativadas", catalog.rules?.borders === false);
check("Broto meio a meio desativado", catalog.rules?.brotoHalf === false);
check("Adicionais: máximo 5 unidades", catalog.rules?.maxAddonUnits === 5);
check("Adicionais: máximo 2 do mesmo", catalog.rules?.maxSameAddon === 2);
check("Observações: máximo 500 caracteres", catalog.rules?.notesMaxLength === 500);
check("Fidelidade: 10 pontos / saldo 15", catalog.rules?.loyaltyThreshold === 10 && catalog.rules?.loyaltyMax === 15);
check("Recompensa apenas Mozzarella/Calabresa Tradicional", JSON.stringify(catalog.rules?.loyaltyRewardFlavors) === JSON.stringify(["mozzarella","calabresa-tradicional"]));
check("15 mesas", catalog.tables.length === 15);
check("10 mesas de 5 lugares", catalog.tables.filter(x => x.capacity === 5).length === 10);
check("5 mesas de 2 lugares", catalog.tables.filter(x => x.capacity === 2).length === 5);

const uniqueWithin = list => new Set(list.map(x => x.id)).size === list.length;
check("IDs únicos em cada cadastro", [catalog.flavors,catalog.addons,catalog.beverages,catalog.desserts].every(uniqueWithin));
check("Preços em centavos inteiros", catalog.flavors.every(x => Number.isInteger(x.priceGrande) && Number.isInteger(x.priceBroto)) && [...catalog.addons,...catalog.beverages,...catalog.desserts].every(x => Number.isInteger(x.price)));
check("Ingredientes cadastrados em todos os sabores", catalog.flavors.every(x => Array.isArray(x.ingredients) && x.ingredients.length > 0));

const catalogTs = read("src/lib/catalog.ts");
const assetRefs = [...catalogTs.matchAll(/"(\/assets\/[^"']+)"/g)].map(match => `public${match[1]}`);
const missingAssets = assetRefs.filter(file => !exists(file));
check("Todos os assets referenciados existem", missingAssets.length === 0, missingAssets.join(", "));

const requiredRoutes = [
  "src/app/page.tsx","src/app/checkout/page.tsx","src/app/pedido/[id]/page.tsx","src/app/acompanhar/[token]/page.tsx",
  "src/app/painel/page.tsx","src/app/painel/pedidos/page.tsx","src/app/painel/pdv/page.tsx","src/app/painel/salao/page.tsx",
  "src/app/painel/garcom/page.tsx","src/app/garcom/page.tsx","src/app/painel/kds/page.tsx","src/app/painel/delivery/page.tsx","src/app/painel/motoboy/page.tsx",
  "src/app/painel/clientes/page.tsx","src/app/painel/fidelidade/page.tsx","src/app/painel/estoque/page.tsx","src/app/painel/caixa/page.tsx",
  "src/app/painel/financeiro/page.tsx","src/app/painel/relatorios/page.tsx","src/app/painel/integracoes/page.tsx","src/app/painel/integracoes/99food/page.tsx","src/app/painel/impressao/page.tsx",
  "src/app/painel/usuarios/page.tsx","src/app/painel/auditoria/page.tsx","src/app/painel/continuidade/page.tsx",
  "src/app/painel/configuracoes/page.tsx","src/app/painel/campanhas/page.tsx","src/app/painel/cardapio/page.tsx",
  "src/app/painel/rotinas/page.tsx","src/app/painel/tarefas/page.tsx","src/app/painel/aprovacoes/page.tsx",
  "src/app/painel/notificacoes/page.tsx","src/app/painel/expedicao/page.tsx","src/app/painel/diagnostico/page.tsx",
  "src/app/painel/compras/page.tsx","src/app/painel/comunicacao/page.tsx",
  "src/app/painel/atencao/page.tsx","src/app/painel/inventario/page.tsx","src/app/painel/sistema/page.tsx","src/app/painel/ajuda/page.tsx",
  "src/app/mesa/[number]/page.tsx","src/app/avaliar/[id]/page.tsx","src/app/meus-pedidos/page.tsx"
];
check("Telas públicas e operacionais presentes", requiredRoutes.every(exists), requiredRoutes.filter(x => !exists(x)).join(", "));

const allSourceFiles = [];
function walk(dir) { for (const entry of fs.readdirSync(dir,{withFileTypes:true})) { const full=path.join(dir,entry.name); if(entry.isDirectory()) walk(full); else allSourceFiles.push(full); } }
walk(path.join(root,"src"));
const sourceText = allSourceFiles.filter(x => /\.(ts|tsx)$/.test(x)).map(x => fs.readFileSync(x,"utf8")).join("\n");
check("Nenhum componente de seleção de borda", !/(Escolha|Selecionar|Adicionar)\s+(uma\s+)?borda/i.test(sourceText));
check("Validação explícita contra bordas", /Bordas não existem neste sistema/.test(sourceText));

const sqlFiles = fs.readdirSync(path.join(root,"supabase/migrations")).filter(x => x.endsWith(".sql")).sort();
const sql = sqlFiles.map(x => read(`supabase/migrations/${x}`)).join("\n");
check("Migrações SQL 001–023 presentes", sqlFiles.length >= 23 && sqlFiles[0].startsWith("001") && sqlFiles.some(x => x.startsWith("023")), sqlFiles.join(", "));
check("RLS habilitado", /enable row level security/i.test(sql));
check("Auditoria imutável", /audit_no_update/i.test(sql));
check("Chaves de idempotência", /idempotency_keys/i.test(sql));
check("Webhook e filas com deduplicação", /unique\(provider,event_id\)/i.test(sql) && /for update skip locked/i.test(sql));
check("Restrição de Broto no banco", /broto_single_flavor/i.test(sql));
check("Restrição de borda no banco", /no_border_payload/i.test(sql));
check("Estoque somente em produtos rastreados", /where stock_tracked/i.test(sql));
check("Fidelidade limitada a 15", /least\(15,v_balance\+1\)/i.test(sql));
check("Marketplace sem perfil no CRM", /not in \('ifood','99food'\)/i.test(sql));
check("QR de mesa abre/reutiliza comanda de forma atômica", /v_channel='table_qr'[\s\S]*open_table_tab/i.test(sql) && /Comanda da mesa não está mais aberta/i.test(sql));
check("QR não cria perfil no CRM", /not in \('ifood','99food','table_qr'\)/i.test(sql));
check("Pagamentos parciais fecham comanda e liberam mesa", /record_tab_payment/i.test(sql) && /status='free'[\s\S]*v_open_count=0/i.test(sql));
check("Junção e separação de mesas", /group_restaurant_tables/i.test(sql) && /ungroup_restaurant_table/i.test(sql));
check("Recompensa exige autorização transacional", /reward_authorizations/i.test(sql) && /consume_order_with_reward_transaction/i.test(sql));

const checkoutSource = read("src/app/checkout/page.tsx");
const publicOrderApi = read("src/app/api/orders/route.ts");
check("Checkout preserva mesa e comanda do QR", /mesa/.test(checkoutSource) && /tableTabKey/.test(checkoutSource) && /tabName/.test(checkoutSource));
check("QR não cobra nem fecha automaticamente", /Nenhuma cobrança é feita pelo QR Code/.test(checkoutSource) && /paymentStatus: "pending"/.test(checkoutSource));
check("API pública aceita somente delivery, retirada e QR", /own_delivery.*pickup.*table_qr/.test(publicOrderApi) && /Canal não permitido no checkout público/.test(publicOrderApi));
check("Recompensa bloqueada no checkout público", /Recompensas são lançadas exclusivamente/.test(publicOrderApi));
check("APIs de gestão financeira e CRM presentes", ["src/app/api/crm/route.ts","src/app/api/financial/route.ts","src/app/api/reports/route.ts","src/app/api/campaigns/route.ts","src/app/api/settings/route.ts"].every(exists));
check("Saúde e retentativa de integrações presentes", exists("src/app/api/integrations/health/route.ts") && exists("src/app/api/integrations/events/[id]/retry/route.ts"));
check("Fluxos transacionais de salão presentes", ["src/app/api/tables/[number]/tabs/route.ts","src/app/api/tabs/[id]/payments/route.ts","src/app/api/tables/groups/route.ts"].every(exists));

const megaFiles = [
  "src/components/internal/OrderDetailPanel.tsx",
  "src/app/api/orders/[id]/items/route.ts",
  "src/app/api/orders/[id]/payments/route.ts",
  "src/app/api/orders/[id]/communications/route.ts",
  "src/app/api/orders/[id]/print/route.ts",
  "src/app/api/store-status/route.ts",
  "src/app/api/print/jobs/route.ts",
  "supabase/migrations/013_admin_control_center.sql",
  "scripts/audit-buttons.mjs"
];
check("Mega Update administrativo presente", megaFiles.every(exists), megaFiles.filter(file => !exists(file)).join(", "));
check("Central da comanda com seis áreas", /resumo.*itens.*pagamento.*comunicacao.*ocorrencias.*historico/s.test(read("src/components/internal/OrderDetailPanel.tsx")));
check("Pedido administrável com notas e ocorrências", /order_internal_notes/.test(sql) && /order_incidents/.test(sql));
check("Comunicação manual auditável", /order_communication_logs/.test(sql) && /manual_whatsapp/.test(sql));
check("Pagamento manual transacional", /record_order_payment_transaction/.test(sql));
check("Status controlado exige pagamento e motivo", /change_order_status_controlled/.test(sql) && /Confirme o recebimento integral/.test(sql) && /Motivo obrigatório/.test(sql));
check("Estado operacional da loja administrável", /store_runtime_status/.test(sql) && /operational_status/.test(sql));
check("Permissões específicas no backend", /permissions\[permission\] === false/.test(read("src/lib/authz.ts")));
check("Cardápio editável sem acessar banco", /Salvar e versionar alteração/.test(read("src/app/painel/cardapio/page.tsx")));
check("Delivery operável sem mapa", /A operação continua funcional por endereço textual/.test(read("src/app/painel/delivery/page.tsx")));

const autonomyFiles = [
  "supabase/migrations/014_autonomy_operations_and_control.sql",
  "src/app/api/control-center/route.ts",
  "src/app/api/operations/checklists/route.ts",
  "src/app/api/tasks/route.ts",
  "src/app/api/approvals/route.ts",
  "src/app/api/notifications/route.ts",
  "src/app/api/expedition/route.ts",
  "src/app/api/system/diagnostics/route.ts",
  "src/app/api/system/export/route.ts",
  "src/app/api/purchases/route.ts",
  "src/app/api/communication-templates/route.ts",
  "src/components/internal/GlobalSearchDialog.tsx",
  "src/components/internal/StoreControlPanel.tsx",
  ".github/workflows/quality.yml",
  "scripts/check-migrations.mjs"
];
check("Mega Update 04 de autonomia presente", autonomyFiles.every(exists), autonomyFiles.filter(file => !exists(file)).join(", "));
check("Rotinas guiadas de abertura e fechamento", /operational_checklist_templates/.test(sql) && /start_operational_checklist/.test(sql) && /complete_operational_checklist/.test(sql));
check("Tarefas e aprovações persistentes", /operation_tasks/.test(sql) && /approval_requests/.test(sql) && /resolve_approval_request/.test(sql));
check("Expedição auditável", /expedition_status/.test(sql) && /set_order_expedition_status/.test(sql));
check("Perfis de impressão administráveis", /print_profiles/.test(sql) && /paper_columns/.test(sql));
check("Compras atualizam estoque transacionalmente", /purchase_orders/.test(sql) && /receive_purchase_order/.test(sql) && /PURCHASE_ORDER_RECEIVED/.test(sql));
check("Exportação operacional protegida", /OPERATIONAL_EXPORT_GENERATED/.test(read("src/app/api/system/export/route.ts")) && /requireOperationalRole\(\["manager"\]/.test(read("src/app/api/system/export/route.ts")));
check("Gate de qualidade no GitHub", /npm run typecheck/.test(read(".github/workflows/quality.yml")) && /npm run build/.test(read(".github/workflows/quality.yml")));
check("Modelos de comunicação administráveis", exists("src/app/painel/comunicacao/page.tsx") && exists("src/app/api/communication-templates/[key]/route.ts"));

const maturityFiles = [
  "supabase/migrations/015_operational_maturity_and_reliability.sql",
  "src/app/painel/atencao/page.tsx",
  "src/app/painel/inventario/page.tsx",
  "src/app/painel/sistema/page.tsx",
  "src/app/painel/ajuda/page.tsx",
  "src/app/trocar-senha/page.tsx",
  "src/app/api/attention/route.ts",
  "src/app/api/feature-flags/route.ts",
  "src/app/api/orders/[id]/lock/route.ts",
  "src/app/api/inventory/counts/route.ts",
  "src/app/api/auth/change-password/route.ts",
  "src/app/api/system/snapshots/route.ts",
  "src/lib/operational-state.ts"
];
check("Mega Update 05 de maturidade presente", maturityFiles.every(exists), maturityFiles.filter(file => !exists(file)).join(", "));
check("Controle de concorrência de pedidos", /order_edit_locks/.test(sql) && /acquire_order_edit_lock/.test(sql) && /ORDER_VERSION_CONFLICT/.test(read("src/app/api/orders/[id]/status/route.ts")));
check("Central de atenção operacional", /api\/attention/.test(read("src/app/painel/atencao/page.tsx")) && /waitingDriver|sem motoboy/.test(read("src/app/api/attention/route.ts")));
check("Feature flags persistentes", /feature_flags/.test(sql) && /FEATURE_FLAG_UPDATED/.test(read("src/app/api/feature-flags/route.ts")));
check("Inventário assistido e auditado", /inventory_counts/.test(sql) && /complete_inventory_count/.test(sql) && /Inventário rápido/.test(read("src/app/painel/inventario/page.tsx")));
check("Troca obrigatória de senha", /must_change_password/.test(sql) && /trocar-senha/.test(read("src/components/internal/AdminShell.tsx")) && /PASSWORD_CHANGED/.test(read("src/app/api/auth/change-password/route.ts")));
check("Snapshots de configuração", /configuration_snapshots/.test(sql) && /CONFIGURATION_SNAPSHOT_RESTORED/.test(read("src/app/api/system/snapshots/route.ts")));

const integrationReadyFiles = [
  "supabase/migrations/016_integration_ready_99food_tracking_smartpos.sql",
  "src/lib/integrations/core/errors.ts",
  "src/lib/integrations/core/events.ts",
  "src/lib/integrations/core/safe-log.ts",
  "src/lib/integrations/food99/config.ts",
  "src/lib/integrations/food99/official-contract.ts",
  "src/lib/integrations/food99/webhook.ts",
  "src/lib/integrations/food99/orders.ts",
  "src/app/api/integrations/99food/webhook/route.ts",
  "src/app/api/integrations/99food/status/route.ts",
  "src/app/api/integrations/99food/logs/route.ts",
  "src/app/painel/integracoes/99food/page.tsx",
  "src/app/api/drivers/shifts/start/route.ts",
  "src/app/api/drivers/shifts/end/route.ts",
  "src/app/api/devices/register/route.ts",
  "src/lib/integrations/rede/official-contract.ts"
];
check("Mega Update 06 Integration Ready presente", integrationReadyFiles.every(exists), integrationReadyFiles.filter(file => !exists(file)).join(", "));
const food99Source = [
  "src/lib/integrations/food99.ts",
  "src/lib/integrations/food99/config.ts",
  "src/lib/integrations/food99/official-contract.ts",
  "src/lib/integrations/food99/webhook.ts",
  "src/lib/integrations/food99/orders.ts",
  "src/lib/integrations/food99/status.ts",
  "src/lib/integrations/food99/cancellation.ts",
  "src/lib/integrations/food99/mapper.ts"
].map(read).join("\n");
check("99Food sem endpoints inventados", !/\/orders\/\$\{|x-99food-signature|x-99-signature|\/oauth\/token|\/order\/accept/i.test(food99Source));
check("99Food bloqueia chamadas sem contrato oficial", /requireFood99OfficialContract/.test(food99Source) && /FOOD99_OFFICIAL_DOCS_REQUIRED/.test(food99Source));
check("Webhook 99Food exato e público", /api\/integrations\/99food\/webhook/.test(read("middleware.ts")) && /validateFood99Webhook/.test(read("src/app/api/integrations/99food/webhook/route.ts")));
check("99Food usa fila idempotente existente", /enqueueIntegrationEvent/.test(read("src/app/api/integrations/99food/webhook/route.ts")) && /onConflict: "provider,event_id"/.test(read("src/lib/integrations/core/events.ts")));
check("Worker 99Food preparado para buscar pedido completo", /resolveFood99OrderFromEvent/.test(read("src/lib/workers/marketplace.ts")));
check("Rastreamento interno separado do cliente", /driver_shifts/.test(sql) && /customer_visible/.test(sql) && /record_driver_location_v2/.test(sql) && /order_id drop not null/.test(sql));
check("Cliente perde rastreio ao concluir e turno interno permanece independente", /sync_customer_tracking_visibility/.test(sql) && /customer_visible=false/.test(sql) && /end_driver_shift/.test(sql));
check("SmartPOS preparado sem API Rede inventada", /registered_devices/.test(sql) && /waiter_smartpos/.test(sql) && /SDK\/App2App/.test(read("src/lib/integrations/rede.ts")));
check("Garçom preparado para terminal SmartPOS", /waiter_smartpos/.test(read("src/app/painel/garcom/page.tsx")) && /api\/devices\/register/.test(read("src/app/painel/garcom/page.tsx")));

const productionFinalFiles = [
  "supabase/migrations/017_production_final_hardening.sql",
  "src/lib/client/api.ts",
  "src/app/error.tsx",
  "src/app/loading.tsx",
  "src/app/painel/error.tsx",
  "src/app/painel/loading.tsx",
  "src/app/api/inventory/route.ts",
  "src/app/api/audit/route.ts",
  "src/app/api/coupons/[id]/route.ts"
];
check("Mega Update 07 Production Final presente", productionFinalFiles.every(exists), productionFinalFiles.filter(file => !exists(file)).join(", "));
const productionMigration = read("supabase/migrations/017_production_final_hardening.sql");
const demoStore = read("src/lib/demo-store.ts");
const checkoutFinal = read("src/app/checkout/page.tsx");
const expeditionFinal = read("src/app/painel/expedicao/page.tsx");
check("Produção não restaura localStorage operacional", demoStore.includes("if (!isDemoMode()) {\n    memory = emptyState();") && demoStore.includes("if (typeof window !== \"undefined\" && isDemoMode()) localStorage.setItem"));
check("Numeração de pedido é atômica no PostgreSQL", /order_number_seq/.test(productionMigration) && /orders_assign_number_server_side/.test(productionMigration) && /nextval\('public\.order_number_seq'\)/.test(productionMigration));
check("Checkout usa cotação autoritativa e chave idempotente persistente", /CheckoutQuote/.test(checkoutFinal) && /checkoutKeyRef/.test(checkoutFinal) && /finalOrderId/.test(checkoutFinal) && /coverageConfigurationPending/.test(checkoutFinal));
check("Delivery público bloqueia cobertura não configurada", /coverageConfigurationPending/.test(publicOrderApi) && /bairros e taxas ainda não foram configurados/i.test(publicOrderApi));
check("Caixa, financeiro e estoque usam APIs em produção", /api\/cash/.test(read("src/app/painel/caixa/page.tsx")) && /api\/financial/.test(read("src/app/painel/financeiro/page.tsx")) && /api\/inventory/.test(read("src/app/painel/estoque/page.tsx")));
check("KDS, salão e motoboy usam mutações server-first", /api\/orders\/\$\{order\.id\}\/status/.test(read("src/app/painel/kds/page.tsx")) && /api\/tables\//.test(read("src/app/painel/salao/page.tsx")) && /api\/drivers\/shifts\/start/.test(read("src/app/painel/motoboy/page.tsx")));
check("Checklist da expedição persiste e é validado no banco", /expedition_checklist/.test(productionMigration) && /save_order_expedition_checklist/.test(productionMigration) && /set_order_expedition_status_v2/.test(productionMigration) && /action: "checklist"/.test(expeditionFinal));

const diagnosticsSource = read("src/app/api/system/diagnostics/route.ts");
check("App e diagnóstico alinhados no MU13 / migration 23", JSON.parse(read("package.json")).version === "9.0.0" && /const REQUIRED_MIGRATION = 23/.test(diagnosticsSource) && /const APP_VERSION = "MU13"/.test(diagnosticsSource));

const finalHomologationFiles = [
  "supabase/migrations/019_final_homologation.sql",
  "src/lib/stable-store.ts",
  "src/app/garcom/page.tsx",
  "src/app/api/orders/[id]/served/route.ts",
  "src/app/api/client-errors/route.ts"
];
check("Mega Update 09 Final Homologation presente", finalHomologationFiles.every(exists), finalHomologationFiles.filter(file => !exists(file)).join(", "));
check("Store operacional usa assinatura estável", /useDemoState\(\(snapshot\) => snapshot\)/.test(read("src/lib/stable-store.ts")) && /normalizeOperationalSnapshot/.test(read("src/components/internal/OperationalHydrator.tsx")));
check("Snapshot busca itens apenas dos pedidos carregados", /\.in\("order_id", orderIds\)/.test(read("src/app/api/operational-snapshot/route.ts")) && /snapshotVersion:\s*9/.test(read("src/app/api/operational-snapshot/route.ts")));
check("Garçom mobile lança pedido e registra servido sem fechar comanda", /api\/internal-orders/.test(read("src/app/garcom/page.tsx")) && /\/served/.test(read("src/app/garcom/page.tsx")) && /mark_order_served/.test(sql));
check("Telemetria de erro protegida e redigida", /client_error_events/.test(sql) && /SUPABASE_KEY_REDACTED/.test(read("src/app/api/client-errors/route.ts")) && /errorId/.test(read("src/app/painel/error.tsx")));

const manifest = JSON.parse(read("public/manifest.webmanifest"));
check("PWA com ícones 192 e 512", manifest.icons?.some(x => x.sizes === "192x192") && manifest.icons?.some(x => x.sizes === "512x512"));
check("Service worker presente", exists("public/sw.js"));
check("Bridge de impressão presente", exists("bridge/print-bridge.mjs") && exists("bridge/config.example.json"));
const cronFile = exists("vercel.json") ? "vercel.json" : exists("vercel.pro.json") ? "vercel.pro.json" : null;
check("Cron de filas preservado", Boolean(cronFile) && /process-queues/.test(read(cronFile)));

const secretsPattern = /(sk_live_|service_role\s*[=:]\s*[A-Za-z0-9_-]{20,}|-----BEGIN PRIVATE KEY-----)/;
check("Nenhum segredo evidente versionado", !secretsPattern.test(sourceText + read(".env.example")));

const passed = results.filter(x => x.ok).length;
const failed = results.length - passed;
const stamp = new Date().toISOString();
const report = [
  "# Relatório de verificação estática",
  "",
  `Gerado em: ${stamp}`,
  "",
  `Resultado: **${passed}/${results.length} verificações aprovadas**${failed ? `; ${failed} falha(s)` : ""}.`,
  "",
  "| Verificação | Resultado | Detalhe |",
  "|---|---:|---|",
  ...results.map(x => `| ${x.name.replaceAll("|","/")} | ${x.ok ? "APROVADO" : "FALHOU"} | ${(x.detail || "—").replaceAll("|","/")} |`),
  "",
  "## Limite do ambiente desta entrega",
  "",
  "O registro acima valida dados, arquivos, regras críticas, rotas, assets, migrações e contratos de segurança sem depender da rede. A instalação das dependências e o `next build` devem ser executados no ambiente de implantação com acesso ao registro npm. Integrações externas exigem credenciais e homologação dos fornecedores.",
  ""
].join("\n");
fs.writeFileSync(path.join(root,"docs/TEST_REPORT.md"),report);
fs.writeFileSync(path.join(root,"docs/verification-result.json"),JSON.stringify({generatedAt:stamp,passed,failed,sha256:crypto.createHash("sha256").update(JSON.stringify(results)).digest("hex"),results},null,2));
console.log(`${passed}/${results.length} verificações aprovadas`);
for (const item of results.filter(x => !x.ok)) console.error(`FALHOU: ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);