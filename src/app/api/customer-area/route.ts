import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const token=(request.nextUrl.searchParams.get("token")||"").trim();
    if(token.length<16) return NextResponse.json({error:"Token privado obrigatório."},{status:401});
    const db=createAdminClient();
    if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});
    const hash=createHash("sha256").update(token).digest("hex");
    const {data:access,error:accessError}=await db.from("order_access_tokens").select("order_id,expires_at,revoked_at").eq("token_hash",hash).maybeSingle();
    if(accessError)throw accessError;
    if(!access||access.revoked_at||Date.parse(access.expires_at)<Date.now())return NextResponse.json({error:"Acesso expirado ou inválido."},{status:401});
    const {data:anchor,error:anchorError}=await db.from("orders").select("id,customer_id,customer_name,customer_phone").eq("id",access.order_id).is("deleted_at",null).single();
    if(anchorError)throw anchorError;
    let orderQuery=db.from("orders").select("id,number,status,total_cents,created_at,updated_at,channel").is("deleted_at",null).not("channel","in","(ifood,99food)").order("created_at",{ascending:false}).limit(100);
    if(anchor.customer_id) orderQuery=orderQuery.eq("customer_id",anchor.customer_id); else orderQuery=orderQuery.eq("id",anchor.id);
    const {data:orders,error:ordersError}=await orderQuery;if(ordersError)throw ordersError;
    let loyalty={balance:0,lifetimePoints:0,rewardsRedeemed:0};
    if(anchor.customer_id){const {data:account,error}=await db.from("loyalty_accounts").select("balance,lifetime_points,rewards_redeemed").eq("customer_id",anchor.customer_id).maybeSingle();if(error)throw error;if(account)loyalty={balance:Number(account.balance||0),lifetimePoints:Number(account.lifetime_points||0),rewardsRedeemed:Number(account.rewards_redeemed||0)};}
    return NextResponse.json({customer:{id:anchor.customer_id||undefined,name:anchor.customer_name,phone:anchor.customer_phone},loyalty,orders:(orders||[]).map((o:any)=>({id:o.id,number:Number(o.number),status:o.status,total:Number(o.total_cents),createdAt:o.created_at,updatedAt:o.updated_at,channel:o.channel}))},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao abrir área do cliente."},{status:400})}
}
