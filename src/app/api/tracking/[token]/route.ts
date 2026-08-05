import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(_:Request,{params}:{params:Promise<{token:string}>}){const {token}=await params;const db=createAdminClient();if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});const {data,error}=await db.rpc("get_public_tracking",{p_token:token});if(error||!data)return NextResponse.json({error:"Link inválido ou expirado."},{status:404});return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}})}
