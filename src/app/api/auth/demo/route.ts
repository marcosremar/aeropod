import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/demo
 * Login automatico com usuario demo para desenvolvimento/testes
 * Uso: /api/auth/demo?redirect=/editor/[id]
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  // Dados do usuario demo
  const demoUser = {
    userId: "f0d87a84-1dcd-4d15-b40e-216c8b0d273d",
    email: "demo@aeropod.com",
    name: "Demo User",
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 horas
  };

  // Criar resposta com redirect
  const response = NextResponse.redirect(new URL(redirectTo, request.url));

  // Setar cookie de sessao (httpOnly para evitar acesso via JavaScript/XSS)
  response.cookies.set("aeropod_session", JSON.stringify(demoUser), {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60, // 24 horas em segundos
  });

  return response;
}
