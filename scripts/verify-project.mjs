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
  "src/app/mesa/[number]/page.tsx","src/app/meus-pedidos/page.tsx"
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
check("Migrações SQL 001–024 presentes", sqlFiles.length >= 24 && sqlFiles[0].startsWith("001") && sqlFiles.some(x => x.startsWith("024")), sqlFiles.join(", "));
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

const publicOrderApi = read("src/app/api/orders/route.ts");
const checkoutSource = read("src/app/checkout/page.tsx");
check("Checkout mantém idempotência", /checkoutKeyRef/.test(checkoutSource) && /Idempotency-Key/.test(checkoutSource));
check("API pública limita canais", /own_delivery.*pickup.*table_qr/.test(publicOrderApi) && /Canal não permitido no checkout público/.test(publicOrderApi));
check("Pedido público valida agenda oficial", /manual_override/.test(publicOrderApi) && /storeStatus\(\)/.test(publicOrderApi));
check("Delivery público bloqueia cobertura ausente", /bairros e taxas ainda não foram configurados/i.test(publicOrderApi));
check("Recompensa pública bloqueada", /Recompensas são lançadas exclusivamente/.test(publicOrderApi));

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
check("Admin pausa e remove sem apagar histórico", /Pausar/.test(menuAdmin) && /Remover/.test(menuAdmin) && /ARCHIVED/.test(read("src/app/api/menu/products/[id]/route.ts")));
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
check("PDV exige endereço para entrega", /Preencha telefone e endereço completo para entrega/.test(pdv));
check("PDV finaliza pelo backend autoritativo", /api\/internal-orders/.test(pdv));

const settingsPage = read("src/app/painel/configuracoes/page.tsx");
const zonesApi = read("src/app/api/settings/delivery-zones/[id]/route.ts");
check("Bairros podem ser adicionados", /Adicionar zona/.test(settingsPage));
check("Bairros podem ser editados", /Editar bairro\/zona/.test(settingsPage));
check("Bairros podem ser pausados e reativados", /Pausar/.test(settingsPage) && /Reativar/.test(settingsPage));
check("Bairros podem ser arquivados", /DELIVERY_ZONE_ARCHIVED/.test(zonesApi) && /deleted_at/.test(zonesApi));

const diagnosticsSource = read("src/app/api/system/diagnostics/route.ts");
check("Diagnóstico alinhado ao MU14 / migration 24", /const REQUIRED_MIGRATION = 24/.test(diagnosticsSource) && /const APP_VERSION = "MU14"/.test(diagnosticsSource));
check("Diagnóstico valida Print Bridge real", /heartbeatFresh/.test(diagnosticsSource) && /bridgeOnline/.test(diagnosticsSource));

check("Controle de concorrência de pedidos", /order_edit_locks/.test(sql) && /ORDER_VERSION_CONFLICT/.test(read("src/app/api/orders/[id]/status/route.ts")));
check("Inventário assistido", /inventory_counts/.test(sql) && exists("src/app/painel/inventario/page.tsx"));
check("Troca obrigatória de senha", /must_change_password/.test(sql) && /trocar-senha/.test(read("src/components/internal/AdminShell.tsx")));
check("Feature flags persistentes", /feature_flags/.test(sql) && exists("src/app/api/feature-flags/route.ts"));
check("99Food sem endpoints inventados", !/x-99food-signature|x-99-signature|\/oauth\/token|\/order\/accept/i.test(sourceText));
check("Gate de qualidade executa typecheck e build", /npm run typecheck/.test(read(".github/workflows/quality.yml")) && /npm run build/.test(read(".github/workflows/quality.yml")));

const manifest = JSON.parse(read("public/manifest.webmanifest"));
check("PWA com ícones 192 e 512", manifest.icons?.some(x => x.sizes === "192x192") && manifest.icons?.some(x => x.sizes === "512x512"));
check("Service worker presente", exists("public/sw.js"));
check("Print Bridge presente", exists("bridge/print-bridge.mjs") && exists("bridge/config.example.json"));
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
