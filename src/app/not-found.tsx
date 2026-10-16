import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
      <p className="font-display text-6xl font-bold text-primary">404</p>
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">O endereço não existe ou você não tem acesso a ele.</p>
      <Button asChild className="mt-2">
        <Link href="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}
