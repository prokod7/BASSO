import { z } from "zod";
import { addonPrice, comboTotal, pizzaTotal, validatePizzaSelection } from "@/lib/pricing";
import { findProduct } from "@/lib/catalog";
import type { CartItem, Order } from "@/types";

const paymentMethodSchema = z.enum([
  "pix","cash","debit","credit","meal_voucher","food_voucher",
  "vr_refeicao","vr_alimentacao","sodexo","pluxe","alelo_refeicao","ticket_restaurante","voucher"
]);
const addressSchema=z.object({cep:z.string(),street:z.string(),number:z.string(),district:z.string(),complement:z.string().optional(),reference:z.string().optional(),city:z.string(),state:z.string(),latitude:z.number().optional(),longitude:z.number().optional()});
const orderSchema=z.object({id:z.string().min(4).max(100),number:z.number().int().positive(),channel:z.enum(["own_delivery","pickup","counter","dine_in","ifood","99food","table_qr"]),status:z.enum(["received","confirmed","preparing","ready","out_for_delivery","completed","cancelled"]),paymentStatus:z.enum(["pending","partial","paid","refunded","cancelled"]),customerName:z.string().max(120),customerPhone:z.string().max(20),customerId:z.string().uuid().optional(),origin:z.enum(["web","whatsapp","phone","counter","table","marketplace"]).optional(),externalId:z.string().max(160).optional(),address:addressSchema.optional(),tableNumber:z.number().int().min(1).max(999).optional(),tabId:z.string().uuid().optional(),tabName:z.string().max(120).optional(),items:z.array(z.any()).min(1).max(80),subtotal:z.number().int().nonnegative(),discount:z.number().int().nonnegative(),deliveryFee:z.number().int().nonnegative(),total:z.number().int().nonnegative(),paymentMethod:paymentMethodSchema,changeFor:z.number().int().nonnegative().optional(),notes:z.string().max(500).optional(),couponCode:z.string().max(30).optional(),createdAt:z.string(),updatedAt:z.string(),trackingToken:z.string().optional(),driverId:z.string().optional(),sourceIdempotencyKey:z.string().min(8)});

export function calculateAuthoritativeSubtotal(items: CartItem[], allowReward=false): number {
  let subtotal=0;
  for(const item of items){
    if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99)throw new Error("Quantidade inválida.");
    if("border" in (item.selection||{})||"borda" in (item.selection||{})||"borderId" in (item.selection||{})||"bordaId" in (item.selection||{}))throw new Error("Bordas não existem neste sistema.");
    let unit=0;
    if(item.kind==="reward"){
      if(!allowReward) throw new Error("Recompensa exige autorização operacional.");
      if(!item.selection||!("flavorA" in item.selection)||!["mozzarella","calabresa-tradicional"].includes(item.selection.flavorA))throw new Error("Recompensa inválida.");
      if(item.selection.size!=="grande"||item.selection.flavorB)throw new Error("A recompensa deve ser uma pizza Grande de um único sabor.");
      validatePizzaSelection(item.selection);
      unit=addonPrice(item.selection.addons);
    } else if(item.kind==="pizza"){
      if(!item.selection||!("flavorA" in item.selection))throw new Error("Configuração de pizza inválida.");
      unit=pizzaTotal(item.selection);
    } else if(item.kind==="combo"){
      if(!item.selection||!("grandeFlavor" in item.selection))throw new Error("Configuração de combo inválida.");
      unit=comboTotal(item.selection);
    } else {
      const product=findProduct(item.productId||"");
      if(!product||!product.active)throw new Error("Produto inválido ou indisponível.");
      unit=product.price;
    }
    if(unit!==item.unitPrice)throw new Error(`Preço divergente no item ${item.name}.`);
    subtotal+=unit*item.quantity;
  }
  return subtotal;
}

export function parseIncomingOrder(input: unknown): Order {
  const order=orderSchema.parse(input) as Order;
  if(order.channel==="own_delivery"&&!order.address)throw new Error("Endereço obrigatório para delivery.");
  if(order.channel!=="own_delivery"&&order.status==="out_for_delivery")throw new Error("Canal não permite status de saída para entrega.");
  if(order.channel==="table_qr"){
    if(!order.tableNumber)throw new Error("Mesa obrigatória para pedido pelo QR Code.");
    if(!order.tabId&&(!order.tabName||order.tabName.trim().length<2))throw new Error("Comanda ou participante obrigatório para pedido pelo QR Code.");
    if(order.status!=="received"||order.paymentStatus!=="pending")throw new Error("Pedido pelo QR Code deve entrar recebido e com pagamento pendente.");
    if(order.address)throw new Error("Pedido de mesa não aceita endereço de entrega.");
    if(!["pix","cash","debit","credit"].includes(order.paymentMethod)) throw new Error("Forma de pagamento indisponível no checkout público.");
  }
  if(order.channel==="dine_in"&&(!order.tableNumber||!order.tabId))throw new Error("Pedido de salão exige mesa e comanda.");
  if(order.total!==Math.max(0,order.subtotal-order.discount+order.deliveryFee))throw new Error("Total divergente.");
  return order;
}

export function validateIncomingOrder(input: unknown,{allowReward=false}:{allowReward?:boolean}={}): Order {
  const order=parseIncomingOrder(input);
  const subtotal=calculateAuthoritativeSubtotal(order.items,allowReward);
  if(subtotal!==order.subtotal)throw new Error("Subtotal divergente.");
  return order;
}