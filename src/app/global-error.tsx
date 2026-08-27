"use client";

// Shown when an error escapes the root layout. It REPLACES the root layout, so
// it must render its own <html>/<body> and cannot rely on globals.css — every
// style here is inline so the page is always readable (never a blank dark void).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#eef1f5",
          color: "#131a22",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          display: "grid",
          placeItems: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "440px",
            background: "#fff",
            border: "1px solid #dbe2e9",
            borderRadius: "12px",
            boxShadow: "0 8px 24px -14px rgba(19,26,34,0.22)",
            padding: "28px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              margin: "0 auto 16px",
              borderRadius: "999px",
              background: "#f6e0dd",
              color: "#96271f",
              display: "grid",
              placeItems: "center",
              fontSize: "26px",
              fontWeight: 700,
            }}
          >
            !
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#55616e", lineHeight: 1.5 }}>
            The page couldn&apos;t be loaded. This is usually a server or database
            connection problem. Please try again, and if it persists check the server logs.
          </p>
          {error?.digest && (
            <p
              style={{
                margin: "0 0 20px",
                fontFamily: "ui-monospace, monospace",
                fontSize: "11px",
                color: "#8592a0",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              appearance: "none",
              border: "none",
              cursor: "pointer",
              background: "#5546e0",
              color: "#fff",
              fontWeight: 600,
              fontSize: "14px",
              padding: "11px 22px",
              borderRadius: "8px",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
