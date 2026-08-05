import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
const schema=z.object({amount:z.number().int().positive(),method:z.enum(["pix","cash","debit","credit","meal_voucher","food_voucher"]),idempotencyKey:z.string().min(8).max(180)});
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{const auth=await requireOperationalRole(["manager","counter","waiter"]);const {id}=await params;const body=schema.parse(await request.json());const db=createAdminClient();if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});const {data,error}=await db.rpc("record_tab_payment",{p_tab_id:id,p_amount_cents:body.amount,p_method:body.method,p_idempotency_key:body.idempotencyKey,p_actor_id:auth.userId==="demo"?null:auth.userId});if(error)throw error;return NextResponse.json(data)}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao registrar pagamento."},{status:400})}}
