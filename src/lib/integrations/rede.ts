import { jsonRequest } from "@/lib/integrations/http";
import type { CardTerminalAdapter,CardTransactionRequest,CardTransactionResult } from "@/lib/integrations/types";
export class RedeAdapter implements CardTerminalAdapter{
 constructor(private config={baseUrl:process.env.REDE_BASE_URL||"",pv:process.env.REDE_PV||"",token:process.env.REDE_TOKEN||""}){}
 private async call(path:string,body:unknown):Promise<any>{if(!this.config.baseUrl||!this.config.pv||!this.config.token)throw new Error("Integração Rede não homologada/configurada.");return jsonRequest(`${this.config.baseUrl}${path}`,{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${this.config.pv}:${this.config.token}`).toString("base64")}`},body:JSON.stringify(body)})}
 async charge(req:CardTransactionRequest):Promise<CardTransactionResult>{const raw=await this.call("/transactions",{amount:req.amountCents,kind:req.method,installments:req.installments||1,reference:req.reference,terminalId:req.terminalId});return{approved:raw.status==="approved"||raw.returnCode==="00",externalId:String(raw.tid||raw.id),authorizationCode:raw.authorizationCode,reason:raw.returnMessage,raw}}
 async cancel(externalId:string,amountCents:number){const raw=await this.call(`/transactions/${externalId}/cancel`,{amount:amountCents});return{approved:raw.status==="approved",externalId,authorizationCode:raw.authorizationCode,reason:raw.returnMessage,raw}}
 async refund(externalId:string,amountCents:number){const raw=await this.call(`/transactions/${externalId}/refund`,{amount:amountCents});return{approved:raw.status==="approved",externalId,authorizationCode:raw.authorizationCode,reason:raw.returnMessage,raw}}
 async health(){try{await this.call("/health",{});return{ok:true,detail:"Terminal/API disponível"}}catch(e){return{ok:false,detail:e instanceof Error?e.message:"Falha desconhecida"}}}
}
