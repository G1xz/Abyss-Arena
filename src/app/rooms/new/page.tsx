import { redirect } from "next/navigation";

/** A criação de salas agora é feita desafiando um jogador diretamente. */
export default function NewRoomPage() {
  redirect("/play");
}
