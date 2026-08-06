import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperationalRole } from "@/lib/authz";
export async function POST(request:NextRequest){try{await requireOperationalRole(["manager","counter","kitchen","bar"], "kds.manage");const {jobId}=z.object({jobId:z.string()}).parse(await request.json());const db=createAdminClient();if(!db)return NextResponse.json({error:"Supabase não configurado."},{status:503});const {error}=await db.from("print_jobs").update({status:"queued",last_error:null,next_attempt_at:new Date().toISOString()}).eq("id",jobId);if(error)throw error;return NextResponse.json({queued:true})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao reprocessar."},{status:400})}}
