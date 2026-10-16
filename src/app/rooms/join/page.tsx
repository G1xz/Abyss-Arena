import { redirect } from "next/navigation";

/** A entrada em salas agora é por convite direto (sem código). */
export default function JoinRoomPage() {
  redirect("/play");
}
