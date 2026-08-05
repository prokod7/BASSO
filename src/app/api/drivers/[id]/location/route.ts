import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperationalRole } from "@/lib/authz";
const schema=z.object({orderId:z.string(),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),accuracy:z.number().nonnegative().optional(),capturedAt:z.string()});
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{await requireOperationalRole(["driver","manager","counter"]);const {id}=await params;const body=schema.parse(await request.json());const db=createAdminClient();if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});const {error}=await db.rpc("record_driver_location",{p_driver_id:id,p_order_id:body.orderId,p_latitude:body.latitude,p_longitude:body.longitude,p_accuracy:body.accuracy||null,p_captured_at:body.capturedAt});if(error)throw error;return NextResponse.json({ok:true})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Localização inválida."},{status:400})}}
