import { apiErrorMessage } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
const schema = z.discriminatedUnion("action", [
  z.object({action:z.literal("transfer"),targetTable:z.number().int().min(1).max(15)}),
  z.object({action:z.literal("rename"),name:z.string().trim().min(1).max(120)}),
  z.object({action:z.literal("cancel"),reason:z.string().trim().min(2).max(300)}),
]);
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    const auth=await requireOperationalRole(["manager","counter","waiter"],"tables.manage");
    const {id}=await params; const body=schema.parse(await request.json());
    if(body.action==="cancel" && auth.role!=="manager" && auth.permissions["orders.cancel"]!==true) throw new Error("Sem autorização para cancelar comandas.");
    const db=createAdminClient(); if(!db) return NextResponse.json({error:"Supabase não configurado."},{status:503});
    const actor=auth.userId==="demo"?null:auth.userId;
    const {error}=body.action==="transfer"
      ? await db.rpc("transfer_tab",{p_tab_id:id,p_target_table:body.targetTable,p_actor_id:actor})
      : await db.rpc("manage_tab_transaction",{p_tab_id:id,p_action:body.action,p_name:body.action==="rename"?body.name:null,p_reason:body.action==="cancel"?body.reason:null,p_actor_id:actor});
    if(error) throw error; return NextResponse.json({saved:true});
  } catch(error) { return NextResponse.json({error:apiErrorMessage(error, "Falha ao alterar comanda.")},{status:400}); }
}
