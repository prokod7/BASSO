import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    await requireOperationalRole(["manager","counter","waiter","kitchen","bar","driver","finance","viewer"]);
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const [ordersR, itemsR, tablesR, tabsR, driversR, inventoryR, productsR, couponsR, eventsR, auditR, cashR, financialR, campaignsR] = await Promise.all([
      db.from("orders").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
      db.from("order_items").select("*").order("created_at", { ascending: true }).limit(2000),
      db.from("restaurant_tables").select("*").order("number"),
      db.from("tabs").select("*").neq("status", "closed"),
      db.from("drivers").select("*").eq("active", true),
      db.from("inventory_items").select("*"),
      db.from("products").select("id,name,category"),
      db.from("coupons").select("*").order("created_at", { ascending: false }),
      db.from("integration_events").select("id,provider,event_type,status,created_at,attempts").order("created_at", { ascending: false }).limit(50),
      db.from("audit_logs").select("id,actor_label,action,entity_type,entity_id,created_at,reason").order("created_at", { ascending: false }).limit(100),
      db.from("cash_sessions").select("*").eq("status","open").order("opened_at",{ascending:false}).limit(1).maybeSingle(),
      db.from("financial_entries").select("*,financial_categories(name)").is("deleted_at",null).order("due_date",{ascending:false}).limit(200),
      db.from("campaigns").select("*").order("created_at",{ascending:false}).limit(100)
    ]);
    const failed = [ordersR,itemsR,tablesR,tabsR,driversR,inventoryR,productsR,couponsR,eventsR,auditR,cashR,financialR,campaignsR].find(r => r.error);
    if (failed?.error) throw failed.error;
    const productMap = new Map((productsR.data || []).map((p: any) => [p.id,p]));
    const itemsByOrder = new Map<string, any[]>();
    for (const i of itemsR.data || []) { const arr = itemsByOrder.get(i.order_id) || []; arr.push({ id:i.id, kind:i.kind, name:i.name_snapshot, quantity:i.quantity, unitPrice:i.unit_price_cents, productId:i.product_id || undefined, selection:i.selection || undefined }); itemsByOrder.set(i.order_id,arr); }
    const orders = (ordersR.data || []).map((o: any) => ({ id:o.id,number:Number(o.number),channel:o.channel,status:o.status,paymentStatus:o.payment_status,customerName:o.customer_name,customerPhone:o.customer_phone,customerId:o.customer_id||undefined,address:o.address||undefined,tableNumber:o.table_number||undefined,tabId:o.tab_id||undefined,items:itemsByOrder.get(o.id)||[],subtotal:o.subtotal_cents,discount:o.discount_cents,deliveryFee:o.delivery_fee_cents,total:o.total_cents,paymentMethod:o.payment_method,changeFor:o.change_for_cents||undefined,notes:o.notes||undefined,couponCode:o.coupon_code||undefined,createdAt:o.created_at,updatedAt:o.updated_at,driverId:o.driver_id||undefined,sourceIdempotencyKey:o.source_idempotency_key }));
    const tabsByTable = new Map<number, any[]>();
    for (const t of tabsR.data || []) {
      const tabOrders=orders.filter((order:any)=>order.tabId===t.id&&order.status!=="cancelled");
      const arr=tabsByTable.get(t.table_number)||[];
      arr.push({id:t.id,name:t.name,items:tabOrders.flatMap((order:any)=>order.items),paidCents:t.paid_cents,totalCents:tabOrders.reduce((sum:number,order:any)=>sum+order.total,0),waiter:"Equipe",status:t.status});
      tabsByTable.set(t.table_number,arr);
    }
    const tables=(tablesR.data||[]).map((t:any)=>({number:t.number,capacity:t.capacity,status:t.status,people:t.people_count||undefined,openedAt:t.opened_at||undefined,groupId:t.group_id||undefined,tabs:tabsByTable.get(t.number)||[]}));
    const drivers=(driversR.data||[]).map((d:any)=>({id:d.id,name:d.name,phone:d.phone,vehicle:d.vehicle||"Moto",available:d.available,latitude:d.last_latitude?Number(d.last_latitude):undefined,longitude:d.last_longitude?Number(d.last_longitude):undefined,lastLocationAt:d.last_location_at||undefined,activeOrderId:d.active_order_id||undefined}));
    const inventory=(inventoryR.data||[]).map((i:any)=>{const p=productMap.get(i.product_id) as any;return {id:i.id,productId:i.product_id,name:p?.name||i.product_id,unit:i.unit,quantity:Number(i.quantity),minQuantity:Number(i.minimum_quantity),allowNegative:i.allow_negative,updatedAt:i.updated_at}});
    const coupons=(couponsR.data||[]).map((c:any)=>({id:c.id,code:c.code,type:c.discount_type,value:c.value,totalLimit:c.total_limit,uses:c.uses,minimum:c.minimum_cents,channels:c.channels,active:c.active,startsAt:c.starts_at||undefined,endsAt:c.ends_at||undefined}));
    const integrationEvents=(eventsR.data||[]).map((e:any)=>({id:e.id,provider:e.provider,type:e.event_type,status:e.status==="done"?"ok":e.status==="failed"?"error":"pending",createdAt:e.created_at,attempts:e.attempts}));
    const audit=(auditR.data||[]).map((a:any)=>({id:String(a.id),actor:a.actor_label||"Sistema",action:a.action,entity:a.entity_type,entityId:a.entity_id,createdAt:a.created_at,details:a.reason||undefined}));
    const cash=cashR.data as any;
    let cashMovements:any[]=[];
    if(cash){const {data}=await db.from("cash_movements").select("id,kind,amount_cents,reason,created_at").eq("session_id",cash.id).order("created_at",{ascending:false});cashMovements=(data||[]).map((m:any)=>({id:m.id,kind:m.kind,amount:m.amount_cents,reason:m.reason,createdAt:m.created_at,actor:"Equipe"}));}
    const financialEntries=(financialR.data||[]).map((e:any)=>({id:e.id,kind:e.kind,status:e.status,description:e.description,categoryId:e.category_id||undefined,categoryName:e.financial_categories?.name||"Sem categoria",amount:e.amount_cents,dueDate:e.due_date,settledAt:e.settled_at||undefined,paymentMethod:e.payment_method||undefined,recurring:e.recurring,notes:e.notes||undefined,createdAt:e.created_at}));
    const campaigns=(campaignsR.data||[]).map((c:any)=>({id:c.id,name:c.name,channel:c.channel,segment:c.segment,template:c.template,status:c.status,scheduledAt:c.scheduled_at||undefined,createdAt:c.created_at,metrics:{recipients:0,sent:0,opened:0,converted:0}}));
    return NextResponse.json({orders,tables,drivers,inventory,coupons,integrationEvents,audit,cashOpen:!!cash,cashInitial:cash?.initial_cents||0,cashOpenedAt:cash?.opened_at||undefined,cashMovements,financialEntries,campaigns},{headers:{"Cache-Control":"no-store"}});
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar operação." }, { status: 401 }); }
}
