import type { Metadata } from "next";
import { requireUser } from "@/server/auth/next";
import { BuilderPage } from "../builder-page";

export const metadata: Metadata = { title: "Novo deck" };

export default async function NewDeckPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  await requireUser("/decks/new");
  const { welcome } = await searchParams;
  return <BuilderPage title="Novo deck" initial={{ name: "", characterIds: [] }} welcome={Boolean(welcome)} />;
}
