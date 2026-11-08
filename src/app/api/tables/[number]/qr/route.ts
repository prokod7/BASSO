import { NextRequest,NextResponse } from "next/server";
export async function GET(request:NextRequest,{params}:{params:Promise<{number:string}>}){const {number}=await params;const n=Number(number);if(!Number.isInteger(n)||n<1||n>999)return NextResponse.json({error:"Mesa inválida."},{status:400});return NextResponse.json({table:n,url:`${request.nextUrl.origin}/mesa/${n}`})}
