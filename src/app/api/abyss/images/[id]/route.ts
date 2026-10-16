import { prisma } from "@/server/db";

/** Imagens de inimigos baixadas da wiki durante a sincronização do Abismo. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return new Response("Não encontrado", { status: 404 });
  const image = await prisma.abyssImage.findUnique({ where: { id }, select: { contentType: true, data: true } });
  if (!image) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: {
      "content-type": image.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
