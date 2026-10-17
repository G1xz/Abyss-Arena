import Link from "next/link";
import { BRAND, BrandLogo } from "@/components/site-header";

/** Entrar, criar conta e recuperar senha: logo em destaque acima do formulário. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-10">
      <Link href="/" className="mx-auto block w-fit px-4" aria-label={`${BRAND}, página inicial`}>
        <BrandLogo height={120} eager className="w-full max-w-[360px]" />
      </Link>
      {children}
    </div>
  );
}
