import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
const schema=z.object({orderId:z.string(),driverId:z.string().uuid()});
export async function POST(request:NextRequest){try{const auth=await requireOperationalRole(["manager","counter"], "delivery.manage");const {orderId,driverId}=schema.parse(await request.json());const db=createAdminClient();if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});const token=randomBytes(24).toString("base64url");const hash=createHash("sha256").update(token).digest("hex");const expires=new Date(Date.now()+Number(process.env.TRACKING_TOKEN_TTL_MINUTES||180)*60_000).toISOString();const {error}=await db.rpc("assign_delivery",{p_order_id:orderId,p_driver_id:driverId,p_token_hash:hash,p_expires_at:expires,p_actor_id:auth.userId==="demo"?null:auth.userId});if(error)throw error;return NextResponse.json({assigned:true,trackingToken:token,expiresAt:expires})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao atribuir entrega."},{status:400})}}
