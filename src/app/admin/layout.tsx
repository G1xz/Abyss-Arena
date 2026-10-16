import { requireAdminPage } from "@/server/auth/next";
import { AdminNav } from "./admin-ui";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <AdminNav />
      {children}
    </div>
  );
}
