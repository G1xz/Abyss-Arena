"use server";

import { revalidatePath } from "next/cache";
import { echoValues, type FormState } from "@/lib/action-state";
import { updateProfile } from "@/server/auth/accounts";
import { requireUser } from "@/server/auth/next";
import { toErrorResult } from "@/server/errors";
import { formDataToObject } from "@/server/validation";

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/profile");
  const input = formDataToObject(formData);
  try {
    await updateProfile(user.id, input);
    revalidatePath("/", "layout");
    return { ok: true, values: echoValues(input, ["nickname", "genshinUid", "bio"]) };
  } catch (err) {
    return { ...toErrorResult(err), values: echoValues(input, ["nickname", "genshinUid", "bio"]) };
  }
}
