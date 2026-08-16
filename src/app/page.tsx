import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";

export default async function RootPage() {
  const session = await getCurrentSession();
  redirect(session?.user ? "/dashboard" : "/login");
}
