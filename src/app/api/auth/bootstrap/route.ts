import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Solicite a criação ou recuperação de acesso ao gestor da pizzaria." }, { status: 410 });
}
