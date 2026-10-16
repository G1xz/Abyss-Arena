"use server";

import { redirect } from "next/navigation";
import { echoValues, type FormState } from "@/lib/action-state";
import { requireUser } from "@/server/auth/next";
import { toErrorResult } from "@/server/errors";
import { createRoom, joinRoom } from "@/server/matches/service";
import { formDataToObject } from "@/server/validation";

export async function createRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/rooms/new");
  let code: string;
  try {
    const match = await createRoom(user, formDataToObject(formData));
    code = match.code;
  } catch (err) {
    return toErrorResult(err);
  }
  redirect(`/rooms/${code}`);
}

export async function joinRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = formDataToObject(formData);
  const user = await requireUser("/rooms/join");
  let code: string;
  try {
    const match = await joinRoom(user, input.code);
    code = match.code;
  } catch (err) {
    return { ...toErrorResult(err), values: echoValues(input, ["code"]) };
  }
  redirect(`/rooms/${code}`);
}
