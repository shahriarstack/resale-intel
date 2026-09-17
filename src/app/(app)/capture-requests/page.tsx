import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { canDecideCaptureRequest } from "@/lib/rbac";
import { getManagerBook } from "@/lib/recoveryDesk";
import { RequestQueue } from "@/components/recovery/RequestQueue";

export const dynamic = "force-dynamic";

export default async function CaptureRequestsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canDecideCaptureRequest(user.role)) redirect("/dashboard");

  const book = await getManagerBook();
  return <RequestQueue pending={book.pendingRequests} decided={book.decidedRequests} />;
}
