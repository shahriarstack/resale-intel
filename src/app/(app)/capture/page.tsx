import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { canCaptureVehicle } from "@/lib/rbac";
import CaptureScreen from "./CaptureScreen";

export const dynamic = "force-dynamic";

/**
 * The capture form's role gate.
 *
 * The form itself is a client component — it uploads photographs, compresses
 * them in the browser and reads `requestId` / `caseId` off the query string —
 * so it cannot redirect on the server, and for a while it did not check the
 * role at all. Nothing leaked: `GET /api/capture/options` and
 * `POST /api/vehicles` are both Recovery-Team-only, so a signed-in officer
 * from another desk reached the page, watched it fail to load its dropdowns,
 * and got an error panel. That is enforcement working and a bad way to be
 * told, so the check moves to a server component that wraps the form.
 *
 * This gate is about the role. The rule that a vehicle may only come from an
 * approved request or a converted case is the form's own, and is enforced
 * again in `POST /api/vehicles`.
 */
export default async function CapturePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canCaptureVehicle(user.role)) redirect("/dashboard");

  return <CaptureScreen />;
}
