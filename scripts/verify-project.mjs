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
check("29 bebidas", catalog.beverages.length === 29);
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
  "src/app/painel/garcom/page.tsx","src/app/painel/kds/page.tsx","src/app/painel/delivery/page.tsx","src/app/painel/motoboy/page.tsx",
  "src/app/painel/clientes/page.tsx","src/app/painel/fidelidade/page.tsx","src/app/painel/estoque/page.tsx","src/app/painel/caixa/page.tsx",
  "src/app/painel/financeiro/page.tsx","src/app/painel/relatorios/page.tsx","src/app/painel/integracoes/page.tsx","src/app/painel/impressao/page.tsx",
  "src/app/painel/usuarios/page.tsx","src/app/painel/auditoria/page.tsx","src/app/painel/continuidade/page.tsx",
  "src/app/painel/configuracoes/page.tsx","src/app/painel/campanhas/page.tsx","src/app/painel/cardapio/page.tsx",
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
check("Migrações SQL 001–011 presentes", sqlFiles.length >= 11 && sqlFiles[0].startsWith("001") && sqlFiles.some(x => x.startsWith("011")), sqlFiles.join(", "));
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
