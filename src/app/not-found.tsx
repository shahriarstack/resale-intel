import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-paper px-6">
      <div className="card-lg w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
          <Compass size={24} />
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-ink-2">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Link href="/dashboard" className="btn btn-primary mt-6">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
