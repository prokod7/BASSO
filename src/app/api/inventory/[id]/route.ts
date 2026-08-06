import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
const schema=z.object({delta:z.number().finite().refine(v=>v!==0),reason:z.string().min(2).max(300),idempotencyKey:z.string().min(8)});
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{const auth=await requireOperationalRole(["manager","counter"], "inventory.manage");const {id}=await params;const body=schema.parse(await request.json());const db=createAdminClient();if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});const {data,error}=await db.rpc("adjust_inventory",{p_inventory_id:id,p_delta:body.delta,p_reason:body.reason,p_idempotency_key:body.idempotencyKey,p_actor_id:auth.userId==="demo"?null:auth.userId});if(error)throw error;return NextResponse.json({quantity:data})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao ajustar estoque."},{status:400})}}
