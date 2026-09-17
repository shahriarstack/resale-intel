import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { canRequestCapture } from "@/lib/rbac";
import CaptureRequestForm from "./CaptureRequestForm";

export const dynamic = "force-dynamic";

/**
 * The capture request form's role gate.
 *
 * Matches the chooser at `/intake` that links here, so the two cannot
 * disagree about who is allowed to raise a request — and matches
 * `POST /api/capture-requests`, which remains the authority.
 */
export default async function CaptureRequestPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canRequestCapture(user.role)) redirect("/dashboard");

  return <CaptureRequestForm />;
}
