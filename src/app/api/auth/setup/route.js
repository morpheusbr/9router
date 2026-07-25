import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import bcrypt from "bcryptjs";
import { setDashboardAuthCookie } from "@/lib/auth/dashboardSession";

export async function POST(request) {
  try {
    const settings = await getSettings();
    if (settings?.isSetupComplete) {
      return NextResponse.json({ error: "O setup já foi concluído." }, { status: 400 });
    }

    const { password, requireLogin } = await request.json();

    if (typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: "A senha deve ter pelo menos 6 caracteres." }, { status: 400 });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    await updateSettings({
      password: hash,
      requireLogin: requireLogin === true,
      isSetupComplete: true,
    });

    // Automatically log the user in by creating the auth cookie
    const response = NextResponse.json({ success: true });
    await setDashboardAuthCookie(response.cookies, request, { authenticated: true });

    return response;
  } catch (error) {
    console.error("Setup API Error:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
