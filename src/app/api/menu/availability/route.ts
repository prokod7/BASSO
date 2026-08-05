import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRuntimeMenu } from "@/lib/server-menu-pricing";

const channel=z.enum(["own_delivery","pickup","counter","dine_in","ifood","99food","table_qr"]);
const schema=z.object({
  entity:z.enum(["flavor","product","addon"]),id:z.string().min(1).max(120),active:z.boolean(),
  priceGrande:z.number().int().nonnegative().optional(),priceBroto:z.number().int().nonnegative().optional(),price:z.number().int().nonnegative().optional(),
  channels:z.array(channel).min(1).optional(),schedule:z.record(z.any()).optional()
});

export async function GET(){
  try{
    await requireOperationalRole(["manager","counter"]);
    const db=createAdminClient();
    if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});
    const menu=await loadRuntimeMenu(db);
    return NextResponse.json(menu,{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao consultar cardápio."},{status:400})}
}

export async function PATCH(request:NextRequest){
  try{
    const auth=await requireOperationalRole(["manager","counter"]);
    const body=schema.parse(await request.json());
    const db=createAdminClient();
    if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});
    const {error}=await db.rpc("update_menu_item",{
      p_entity:body.entity,p_id:body.id,p_active:body.active,p_price_grande:body.priceGrande??null,p_price_broto:body.priceBroto??null,p_price:body.price??null,
      p_channels:body.channels??null,p_schedule:body.schedule??null,p_actor_id:auth.userId==="demo"?null:auth.userId
    });
    if(error)throw error;
    return NextResponse.json({saved:true,...body});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao atualizar cardápio."},{status:400})}
}
