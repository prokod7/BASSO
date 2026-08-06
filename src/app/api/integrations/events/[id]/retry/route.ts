import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const auth=await requireOperationalRole(["manager"], "settings.manage");const {id}=await params;const db=createAdminClient();if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});
    const {data:before,error:readError}=await db.from("integration_events").select("id,status,attempts,provider,event_type").eq("id",id).single();if(readError)throw readError;
    const {error}=await db.from("integration_events").update({status:"pending",last_error:null,next_attempt_at:new Date().toISOString(),claimed_at:null,processed_at:null}).eq("id",id);if(error)throw error;
    await db.from("audit_logs").insert({actor_id:auth.userId==="demo"?null:auth.userId,actor_label:auth.displayName,action:"INTEGRATION_EVENT_REQUEUED",entity_type:"integration_event",entity_id:id,before_data:before});
    return NextResponse.json({queued:true});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao reprocessar evento."},{status:400})}
}
