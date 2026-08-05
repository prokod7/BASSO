import { createHmac,timingSafeEqual } from "crypto";
import { jsonRequest } from "@/lib/integrations/http";
import type { ExternalOrder, MarketplaceAdapter } from "@/lib/integrations/types";
import type { OrderStatus,PaymentMethod } from "@/types";
function equal(a:string,b:string){const aa=Buffer.from(a);const bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb)}
export class Food99Adapter implements MarketplaceAdapter{
 readonly provider="99food" as const;
 constructor(private config={clientId:process.env.FOOD99_CLIENT_ID||"",clientSecret:process.env.FOOD99_CLIENT_SECRET||"",baseUrl:process.env.FOOD99_BASE_URL||"",webhookSecret:process.env.FOOD99_WEBHOOK_SECRET||""}){}
 verifyWebhook(raw:string,headers:Headers){if(!this.config.webhookSecret)return false;const signature=headers.get("x-99-signature")||headers.get("x-signature")||"";return !!signature&&equal(signature,createHmac("sha256",this.config.webhookSecret).update(raw).digest("hex"))}
 private call<T>(path:string,init:RequestInit={}){if(!this.config.baseUrl)throw new Error("Endpoint da 99Food não configurado.");return jsonRequest<T>(`${this.config.baseUrl}${path}`,{...init,headers:{"X-Client-Id":this.config.clientId,"X-Client-Secret":this.config.clientSecret,...(init.headers||{})}})}
 normalizeOrder(payload:any):ExternalOrder{const o=payload.order||payload;const items=(o.items||[]).map((i:any)=>({externalId:String(i.id),externalProductId:i.productId?String(i.productId):undefined,name:i.name,quantity:Number(i.quantity||1),unitPriceCents:Number(i.unitPriceCents||i.price||0),options:(i.options||i.additions||[]).map((a:any)=>({externalId:a.id?String(a.id):undefined,name:a.name,quantity:Number(a.quantity||1),priceCents:Number(a.priceCents||a.price||0)})),notes:i.notes}));return{provider:"99food",externalId:String(o.id),displayId:String(o.displayId||o.id),createdAt:o.createdAt||new Date().toISOString(),customerDisplayName:o.customer?.name||"Cliente 99Food",customerPhone:o.customer?.phone,deliveryAddress:o.deliveryAddress,items,subtotalCents:Number(o.subtotalCents||0),deliveryFeeCents:Number(o.deliveryFeeCents||0),discountCents:Number(o.discountCents||0),totalCents:Number(o.totalCents||0),paymentMethod:mapPayment(o.payment?.method),paid:o.payment?.paid!==false,raw:payload}}
 async acceptOrder(id:string){await this.call(`/orders/${encodeURIComponent(id)}/accept`,{method:"POST",body:"{}"})}
 async rejectOrder(id:string,reason:string){await this.call(`/orders/${encodeURIComponent(id)}/reject`,{method:"POST",body:JSON.stringify({reason})})}
 async updateStatus(id:string,status:OrderStatus){await this.call(`/orders/${encodeURIComponent(id)}/status`,{method:"POST",body:JSON.stringify({status})})}
 async cancelOrder(id:string,reason:string){await this.call(`/orders/${encodeURIComponent(id)}/cancel`,{method:"POST",body:JSON.stringify({reason})})}
 async health(){try{await this.call("/health");return{ok:true,detail:"Conexão concluída"}}catch(e){return{ok:false,detail:e instanceof Error?e.message:"Falha desconhecida"}}}
}
function mapPayment(value:string|undefined):PaymentMethod{const v=(value||"").toLowerCase();if(v.includes("pix"))return"pix";if(v.includes("cash")||v.includes("dinheiro"))return"cash";if(v.includes("debit"))return"debit";if(v.includes("meal"))return"meal_voucher";if(v.includes("food"))return"food_voucher";return"credit"}
