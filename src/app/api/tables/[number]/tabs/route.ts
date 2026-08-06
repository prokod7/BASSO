import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
const schema=z.object({name:z.string().min(1).max(120),people:z.number().int().min(1).max(20).default(1)});
export async function POST(request:NextRequest,{params}:{params:Promise<{number:string}>}){try{const auth=await requireOperationalRole(["manager","counter","waiter"], "tables.manage");const {number}=await params;const tableNumber=Number(number);if(!Number.isInteger(tableNumber)||tableNumber<1||tableNumber>15)throw new Error("Mesa inválida.");const body=schema.parse(await request.json());const db=createAdminClient();if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});const {data,error}=await db.rpc("open_table_tab",{p_table_number:tableNumber,p_name:body.name,p_people_count:body.people,p_actor_id:auth.userId==="demo"?null:auth.userId});if(error)throw error;return NextResponse.json({id:data,tableNumber,name:body.name},{status:201})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao abrir comanda."},{status:400})}}
