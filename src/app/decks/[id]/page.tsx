import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { BuilderPage } from "../builder-page";

export const metadata: Metadata = { title: "Editar deck" };

export default async function EditDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/decks/${id}`);
  const deck = await prisma.deck.findFirst({ where: { id, userId: user.id }, include: { characters: true } });
  if (!deck) notFound();
  return <BuilderPage title={`Editar: ${deck.name}`} initial={{ id: deck.id, name: deck.name, characterIds: deck.characters.map((c) => c.characterId) }} />;
}
