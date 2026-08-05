import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
const schema=z.object({tableNumbers:z.array(z.number().int().min(1).max(15)).min(2).max(15)});
export async function POST(request:NextRequest){try{const auth=await requireOperationalRole(["manager","counter","waiter"]);const body=schema.parse(await request.json());const db=createAdminClient();if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});const unique=[...new Set(body.tableNumbers)];const {data,error}=await db.rpc("group_restaurant_tables",{p_table_numbers:unique,p_actor_id:auth.userId==="demo"?null:auth.userId});if(error)throw error;return NextResponse.json({groupId:data,tableNumbers:unique},{status:201})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao unir mesas."},{status:400})}}
