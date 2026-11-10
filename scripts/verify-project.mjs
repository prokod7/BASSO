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
check("32 bebidas base (catálogo atualizado pela migration 034)", catalog.beverages.length === 32);
check("20 adicionais", catalog.addons.length === 20);
check("Combo oficial R$ 79,99", catalog.combo?.price === 7999);
check("Bordas desativadas", catalog.rules?.borders === false);
check("Broto sem meio a meio", catalog.rules?.brotoHalf === false);
check("Máximo de 5 adicionais", catalog.rules?.maxAddonUnits === 5);
check("Máximo de 2 unidades do mesmo adicional", catalog.rules?.maxSameAddon === 2);
check("Fidelidade 10 pedidos / saldo 15", catalog.rules?.loyaltyThreshold === 10 && catalog.rules?.loyaltyMax === 15);
check("15 mesas", catalog.tables.length === 15);

const uniqueWithin = list => new Set(list.map(x => x.id)).size === list.length;
check("IDs únicos nos cadastros estáticos", [catalog.flavors,catalog.addons,catalog.beverages,catalog.desserts].every(uniqueWithin));
check("Preços em centavos inteiros", catalog.flavors.every(x => Number.isInteger(x.priceGrande) && Number.isInteger(x.priceBroto)) && [...catalog.addons,...catalog.beverages,...catalog.desserts].every(x => Number.isInteger(x.price)));
check("Ingredientes cadastrados", catalog.flavors.every(x => Array.isArray(x.ingredients) && x.ingredients.length > 0));

const catalogTs = read("src/lib/catalog.ts");
const assetRefs = [...catalogTs.matchAll(/"(\/assets\/[^"']+)"/g)].map(match => `public${match[1]}`);
check("Assets estáticos referenciados existem", assetRefs.every(exists), assetRefs.filter(file => !exists(file)).join(", "));

const requiredRoutes = [
  "src/app/page.tsx","src/app/checkout/page.tsx","src/app/pedido/[id]/page.tsx","src/app/acompanhar/[token]/page.tsx",
  "src/app/painel/page.tsx","src/app/painel/pedidos/page.tsx","src/app/painel/pdv/page.tsx","src/app/painel/salao/page.tsx",
  "src/app/painel/garcom/page.tsx","src/app/garcom/page.tsx","src/app/painel/kds/page.tsx","src/app/painel/delivery/page.tsx","src/app/painel/motoboy/page.tsx",
  "src/app/painel/clientes/page.tsx","src/app/painel/fidelidade/page.tsx","src/app/painel/estoque/page.tsx","src/app/painel/caixa/page.tsx",
  "src/app/painel/financeiro/page.tsx","src/app/painel/relatorios/page.tsx","src/app/painel/impressao/page.tsx","src/app/painel/integracoes/page.tsx",
  "src/app/painel/configuracoes/page.tsx","src/app/painel/cardapio/page.tsx","src/app/painel/auditoria/page.tsx","src/app/painel/diagnostico/page.tsx",
  "src/app/mesa/[number]/page.tsx","src/app/meus-pedidos/page.tsx","src/app/imprimir/[id]/page.tsx","src/app/api/delivery/areas/route.ts"
];
check("Telas públicas e operacionais críticas presentes", requiredRoutes.every(exists), requiredRoutes.filter(x => !exists(x)).join(", "));

const allSourceFiles = [];
function walk(dir) { for (const entry of fs.readdirSync(dir,{withFileTypes:true})) { const full=path.join(dir,entry.name); if(entry.isDirectory()) walk(full); else allSourceFiles.push(full); } }
walk(path.join(root,"src"));
const sourceText = allSourceFiles.filter(x => /\.(ts|tsx)$/.test(x)).map(x => fs.readFileSync(x,"utf8")).join("\n");
check("Nenhum seletor de borda reintroduzido", !/(Escolha|Selecionar|Adicionar)\s+(uma\s+)?borda/i.test(sourceText));
check("Validação explícita contra bordas", /Bordas não existem neste sistema/.test(sourceText));

const sqlFiles = fs.readdirSync(path.join(root,"supabase/migrations")).filter(x => x.endsWith(".sql")).sort();
const sql = sqlFiles.map(x => read(`supabase/migrations/${x}`)).join("\n");
check("Migrações SQL 001–032 presentes", sqlFiles.length >= 32 && sqlFiles[0].startsWith("001") && ["025", "026", "027", "028", "029", "030", "031", "032"].every(n => sqlFiles.some(x => x.startsWith(n))), sqlFiles.join(", "));
check("RLS habilitado", /enable row level security/i.test(sql));
check("Auditoria imutável", /audit_no_update/i.test(sql));
check("Idempotência persistente", /idempotency_keys/i.test(sql));
check("Filas com SKIP LOCKED", /for update skip locked/i.test(sql));
check("Restrição de Broto no banco", /broto_single_flavor/i.test(sql));
check("Restrição de borda no banco", /no_border_payload/i.test(sql));
check("Recompensa transacional", /reward_authorizations/i.test(sql) && /consume_order_with_reward_transaction/i.test(sql));
check("RPC de impressão fechado a browser roles", /revoke execute on function public\.enqueue_order_print_jobs\(text\) from anon/i.test(sql) && /from authenticated/i.test(sql));
check("MU14 cria arquivamento sem destruir histórico", /alter table public\.products add column if not exists deleted_at/i.test(sql) && /alter table public\.categories add column if not exists deleted_at/i.test(sql) && /alter table public\.delivery_zones add column if not exists deleted_at/i.test(sql));
check("MU14 cria bucket de imagens", /product-images/i.test(sql) && /5242880/.test(sql));
check("Produto vinculado à categoria", /products_category_fkey/i.test(sql));
check("MU16 torna cidade explícita na cobertura", /add column if not exists city text/i.test(sql) && /alter column city set not null/i.test(sql) && /delivery_zones_city_active_idx/i.test(sql));

const publicOrderApi = read("src/app/api/orders/route.ts");
const checkoutSource = read("src/app/checkout/page.tsx");
const publicAreas = read("src/app/api/delivery/areas/route.ts");
const serverQuote = read("src/lib/server-quote.ts");
check("Checkout mantém idempotência", /checkoutKeyRef/.test(checkoutSource) && /Idempotency-Key/.test(checkoutSource));
check("API pública limita canais", /own_delivery.*pickup.*table_qr/.test(publicOrderApi) && /Canal não permitido no checkout público/.test(publicOrderApi));
// A regra da agenda fica em src/lib/checkout-order.ts (compartilhada pelo site e pelo robô do WhatsApp).
const checkoutOrderLib = read("src/lib/checkout-order.ts");
check("Pedido público valida agenda oficial", /storeAcceptance\(db\)/.test(publicOrderApi) && /manual_override/.test(checkoutOrderLib) && /storeStatus\(new Date\(\),\s*business.openingHours\)/.test(checkoutOrderLib) && /loadBusinessSettings\(db\)/.test(checkoutOrderLib));
check("Delivery público bloqueia cobertura ausente", /bairros e taxas ainda não foram configurados/i.test(publicOrderApi));
check("Recompensa pública bloqueada", /Recompensas são lançadas exclusivamente/.test(publicOrderApi));
check("Checkout oferece cidade e bairro dependentes", /api\/delivery\/areas/.test(checkoutSource) && /Cidade atendida/.test(checkoutSource) && /Bairro atendido/.test(checkoutSource) && /Selecione a cidade primeiro/.test(checkoutSource));
check("GPS tenta casar localização com cobertura", /matchCoverage/.test(checkoutSource) && /normalizeCityName/.test(checkoutSource) && /normalizeDistrictName/.test(checkoutSource));
check("Frete autoritativo usa cidade + bairro", /city: supplied\.address\?\.city/.test(publicOrderApi) && /findDeliveryZone\(zones, district, city\)/.test(serverQuote));
check("Endpoint público expõe somente cobertura ativa", /\.eq\("active", true\)/.test(publicAreas) && /\.is\("deleted_at", null\)/.test(publicAreas));

const mu14Files = [
  "supabase/migrations/024_catalog_admin_and_product_media.sql",
  "src/app/api/menu/categories/route.ts",
  "src/app/api/menu/categories/[id]/route.ts",
  "src/app/api/menu/products/route.ts",
  "src/app/api/menu/products/[id]/route.ts",
  "src/app/api/menu/images/route.ts",
  "src/app/api/settings/delivery-zones/[id]/route.ts"
];
check("APIs do MU14 presentes", mu14Files.every(exists), mu14Files.filter(file => !exists(file)).join(", "));

const menuAdmin = read("src/app/painel/cardapio/page.tsx");
const menuRuntime = read("src/lib/server-menu-pricing.ts");
const publicMenu = read("src/app/api/menu/public/route.ts");
const publicHome = read("src/app/page.tsx");
const imageApi = read("src/app/api/menu/images/route.ts");
check("Admin cria produtos", /Novo produto/.test(menuAdmin) && /api\/menu\/products/.test(menuAdmin));
check("Admin cria categorias", /Nova categoria/.test(menuAdmin) && /api\/menu\/categories/.test(menuAdmin));
check("Admin pausa e remove sem apagar histórico", /Pausar|Pausado/.test(menuAdmin) && /Remover/.test(menuAdmin) && /ARCHIVED/.test(read("src/app/api/menu/products/[id]/route.ts")));
check("Upload por arquivo substitui URL manual", /Escolher imagem/.test(menuAdmin) && /type="file"/.test(menuAdmin) && /Não precisa colar URL/.test(menuAdmin));
check("Upload limitado e server-side", /MAX_SIZE = 5 \* 1024 \* 1024/.test(imageApi) && /requireOperationalRole\(\["manager"\]/.test(imageApi) && /createAdminClient/.test(imageApi));
check("Upload aceita formatos seguros", /image\/jpeg/.test(imageApi) && /image\/png/.test(imageApi) && /image\/webp/.test(imageApi) && /image\/avif/.test(imageApi));
check("Runtime carrega categorias e ignora arquivados", /categories/.test(menuRuntime) && /\.is\("deleted_at", null\)/.test(menuRuntime));
check("Categoria pausada bloqueia venda", /activeCategories/.test(menuRuntime));
check("Cardápio público recebe categorias runtime", /categories: menu\.categories/.test(publicMenu));
check("Categorias criadas aparecem na home", /productCategories/.test(publicHome) && /runtimeCategories/.test(publicHome));

const pdv = read("src/app/painel/pdv/page.tsx");
check("PDV oferece Entrega explicitamente", /label="Entrega"/.test(pdv) && /own_delivery/.test(pdv));
check("PDV usa cardápio runtime", /api\/menu\/availability/.test(pdv) && /runtimeProducts/.test(pdv));
check("PDV calcula taxa de entrega antes de finalizar", /api\/quote/.test(pdv) && /deliveryQuote/.test(pdv) && /Taxa de entrega/.test(pdv));
check("PDV exige cidade, bairro e endereço para entrega", /Preencha telefone, cidade, bairro e endereço completo para entrega/.test(pdv));
check("PDV usa cobertura cidade + bairro", /api\/delivery\/areas/.test(pdv) && /selectedCity/.test(pdv) && /selectedDistrict/.test(pdv));
check("PDV finaliza pelo backend autoritativo", /api\/internal-orders/.test(pdv));

const settingsPage = read("src/app/painel/configuracoes/page.tsx");
const zonesApi = read("src/app/api/settings/delivery-zones/[id]/route.ts");
check("Cidades e bairros podem ser adicionados", /Adicionar cidade\/bairro/.test(settingsPage) && /zoneCity/.test(settingsPage));
check("Cidades e bairros podem ser editados", /Editar cidade\/bairro/.test(settingsPage));
check("Bairros podem ser pausados e reativados", /Pausar/.test(settingsPage) && /Reativar/.test(settingsPage));
check("Bairros podem ser arquivados", /DELIVERY_ZONE_ARCHIVED/.test(zonesApi) && /deleted_at/.test(zonesApi));

const printRoute = read("src/app/api/orders/[id]/print/route.ts");
const browserPrintPage = read("src/app/imprimir/[id]/page.tsx");
check("Impressão manual vai para a fila da estação automática", /from\("print_jobs"\)\.insert/.test(printRoute) && /window\.print\(\)/.test(browserPrintPage));
check("Comprovante térmico possui layout de 80 mm", /80mm/.test(browserPrintPage) && /@page/.test(browserPrintPage));
check("Comanda de entrega replica estrutura operacional", /CNPJ: (62\.332\.415\/0001-10|\{store\.cnpj)/.test(browserPrintPage) && /Qt\. Descrição/.test(browserPrintPage) && /Forma de pagamento/.test(browserPrintPage) && /RETIRADA DO MOTOBOY/.test(browserPrintPage));
check("Comanda da cozinha é separada e sem financeiro", /printType === "cozinha"/.test(browserPrintPage) && /CÓDIGO DE RETIRADA/.test(browserPrintPage) && /safeNote/.test(browserPrintPage));
check("Comanda imprime QR de retirada", /QRCodeSVG/.test(browserPrintPage) && /pickupUrl/.test(browserPrintPage));
check("Print Bridge permanece opcional", exists("bridge/print-bridge.mjs") && exists("bridge/config.example.json"));

const mu15Files = [
  "supabase/migrations/025_delivery_handoff_tracking_and_print.sql",
  "supabase/migrations/026_customer_tracking_link.sql",
  "src/app/api/delivery/verification/[id]/route.ts",
  "src/app/api/delivery/verification/[id]/pickup/route.ts",
  "src/app/api/delivery/verification/[id]/complete/route.ts",
];
check("MU15 de rastreio e validação presente", mu15Files.every(exists), mu15Files.filter(file => !exists(file)).join(", "));
const pickupApi = read("src/app/api/delivery/verification/[id]/pickup/route.ts");
const completeApi = read("src/app/api/delivery/verification/[id]/complete/route.ts");
const driverPwa = read("src/app/painel/motoboy/page.tsx");
const customerOrder = read("src/app/pedido/[id]/page.tsx");
const deliveryAssign = read("src/app/api/delivery/assign/route.ts");
const statusApi = read("src/app/api/orders/[id]/status/route.ts");
check("Retirada exige QR ou código e motoboy atribuído", /verify_delivery_pickup/.test(sql) && /pickupToken/.test(driverPwa) && /pickupCode/.test(driverPwa) && /verify_delivery_pickup/.test(pickupApi));
check("Entrega exige código privado do cliente", /confirm_delivery_with_code/.test(sql) && /deliveryCode/.test(customerOrder) && /confirm_delivery_with_code/.test(completeApi));
check("Retirada validada e conclusão operacional disponível a todos os perfis", /Valide a retirada pelo QR Code/.test(statusApi) && /body.status === "completed"/.test(statusApi) && /"finance", "viewer"/.test(statusApi));
check("Tentativas inválidas possuem bloqueio", /pickup_attempts\+1>=5/.test(sql) && /delivery_attempts\+1>=5/.test(sql) && /interval '5 minutes'/.test(sql));
check("Token de rastreio é preservado fora do navegador", /token_value/.test(sql) && /token_value: token/.test(deliveryAssign));
check("Tracking token não tem SELECT direto para browser", /revoke all on table public\.tracking_tokens from anon, authenticated/i.test(sql));
check("Pagamento na entrega passa pela transação oficial", /record_order_payment_transaction/.test(completeApi) && /paymentReceived/.test(driverPwa));
check("PWA mantém GPS durante entrega", /watchPosition/.test(driverPwa) && /api\/drivers\/\$\{driverId\}\/location/.test(driverPwa));

const diagnosticsSource = read("src/app/api/system/diagnostics/route.ts");
check("Diagnóstico alinhado ao MU18 / migration 32", /const REQUIRED_MIGRATION = 32/.test(diagnosticsSource) && /const APP_VERSION = "MU18"/.test(diagnosticsSource));
check("Diagnóstico consulta publicação Realtime real", /pedidopro_realtime_health/.test(diagnosticsSource));
const realtimeGoLiveSql = read("supabase/migrations/031_realtime_go_live_audit.sql");
check("Realtime: publica tabelas operacionais", /alter publication supabase_realtime add table/i.test(realtimeGoLiveSql) && /public\.orders/.test(realtimeGoLiveSql) && /public\.restaurant_tables/.test(realtimeGoLiveSql) && /public\.payments/.test(realtimeGoLiveSql));
check("Realtime: RPC restrita ao backend", /revoke all on function public\.pedidopro_realtime_health\(\) from public, anon, authenticated/i.test(realtimeGoLiveSql) && /grant execute on function public\.pedidopro_realtime_health\(\) to service_role/i.test(realtimeGoLiveSql));
check("Diagnóstico valida Print Bridge real", /heartbeatFresh/.test(diagnosticsSource) && /bridgeOnline/.test(diagnosticsSource));

check("Controle de concorrência de pedidos", /order_edit_locks/.test(sql) && /ORDER_VERSION_CONFLICT/.test(read("src/app/api/orders/[id]/status/route.ts")));
check("Inventário assistido", /inventory_counts/.test(sql) && exists("src/app/painel/inventario/page.tsx"));
check("Troca obrigatória de senha", /must_change_password/.test(sql) && /trocar-senha/.test(read("src/components/internal/AdminShell.tsx")));
check("Feature flags persistentes", /feature_flags/.test(sql) && exists("src/app/api/feature-flags/route.ts"));
const food99Source = [
  "src/lib/integrations/food99.ts",
  "src/lib/integrations/food99/config.ts",
  "src/lib/integrations/food99/official-contract.ts",
  "src/lib/integrations/food99/webhook.ts",
  "src/lib/integrations/food99/orders.ts",
  "src/lib/integrations/food99/status.ts",
  "src/lib/integrations/food99/cancellation.ts",
  "src/lib/integrations/food99/mapper.ts",
].filter(exists).map(read).join("\n");
check("99Food sem endpoints inventados", !/x-99food-signature|x-99-signature|\/oauth\/token|\/order\/accept/i.test(food99Source));
check("Gate de qualidade executa typecheck e build", /npm run typecheck/.test(read(".github/workflows/quality.yml")) && /npm run build/.test(read(".github/workflows/quality.yml")));

const manifest = JSON.parse(read("public/manifest.webmanifest"));
check("PWA com ícones 192 e 512", manifest.icons?.some(x => x.sizes === "192x192") && manifest.icons?.some(x => x.sizes === "512x512"));
check("Service worker presente", exists("public/sw.js"));
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
  "## Limite da verificação estática",
  "",
  "Este relatório valida contratos críticos do projeto. TypeScript, testes unitários e build de produção são executados em etapas separadas do Quality Gate.",
  ""
].join("\n");
fs.writeFileSync(path.join(root,"docs/TEST_REPORT.md"),report);
fs.writeFileSync(path.join(root,"docs/verification-result.json"),JSON.stringify({generatedAt:stamp,passed,failed,sha256:crypto.createHash("sha256").update(JSON.stringify(results)).digest("hex"),results},null,2));
console.log(`${passed}/${results.length} verificações aprovadas`);
for (const item of results.filter(x => !x.ok)) console.error(`FALHOU: ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);

