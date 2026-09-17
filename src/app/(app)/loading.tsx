import { PageLoader } from "@/components/ui/PageLoader";

/**
 * The fallback for every route inside the app shell.
 *
 * Sitting at the group level rather than per-route means the sidebar, the
 * corner mark and the footer all stay put while only the page area swaps —
 * the chrome never blinks, which is what makes a navigation feel like moving
 * within one app rather than loading another.
 *
 * Every page in here is `force-dynamic` and queries the database, so this is
 * a wait that genuinely happens. Static routes would show nothing.
 */
export default function AppLoading() {
  return <PageLoader />;
}
