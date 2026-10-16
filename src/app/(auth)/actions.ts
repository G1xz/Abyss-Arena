"use server";

import { redirect } from "next/navigation";
import { echoValues, safeNextPath, type FormState } from "@/lib/action-state";
import { authenticate, registerUser, requestPasswordReset, resetPassword } from "@/server/auth/accounts";
import { clientIp, endSession, startSession } from "@/server/auth/next";
import { toErrorResult } from "@/server/errors";
import { enforceRateLimit } from "@/server/rate-limit";
import { formDataToObject } from "@/server/validation";

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = formDataToObject(formData);
  try {
    enforceRateLimit("register", await clientIp());
    const user = await registerUser(input);
    await startSession(user.id);
  } catch (err) {
    return { ...toErrorResult(err), values: echoValues(input, ["email", "nickname", "genshinUid"]) };
  }
  redirect("/decks/new?welcome=1");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = formDataToObject(formData);
  try {
    enforceRateLimit("login", `${await clientIp()}:${String(input.email ?? "").toLowerCase()}`);
    const user = await authenticate(input);
    await startSession(user.id);
  } catch (err) {
    return { ...toErrorResult(err), values: echoValues(input, ["email"]) };
  }
  redirect(safeNextPath(input.next));
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    enforceRateLimit("passwordReset", await clientIp());
    await requestPasswordReset(formDataToObject(formData), process.env.APP_URL ?? "http://localhost:3000");
    return { ok: true, message: "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha." };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    enforceRateLimit("passwordReset", await clientIp());
    await resetPassword(formDataToObject(formData));
  } catch (err) {
    return toErrorResult(err);
  }
  redirect("/login?reset=1");
}
