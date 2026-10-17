import { apiErrorMessage } from "@/lib/api-error";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
const schema=z.object({status:z.enum(["free","occupied","cleaning","partial"]),people:z.number().int().min(0).max(20).optional()});
export async function PATCH(request:NextRequest,{params}:{params:Promise<{number:string}>}){try{const auth=await requireOperationalRole(["manager","counter","waiter"], "tables.manage");const {number}=await params;const n=Number(number);if(!Number.isInteger(n)||n<1||n>15)throw new Error("Mesa inválida.");const body=schema.parse(await request.json());const db=createAdminClient();if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});const {error}=await db.rpc("set_table_status",{p_table_number:n,p_status:body.status,p_people_count:body.people??null,p_actor_id:auth.userId==="demo"?null:auth.userId});if(error)throw error;return NextResponse.json({number:n,...body})}catch(error){return NextResponse.json({error:apiErrorMessage(error,"Falha ao atualizar mesa.")},{status:400})}}
