/**
 * The end of the page.
 *
 * Sits at the very bottom of every scroll, below whatever the page itself
 * ended with. Text only — the marks already appear in the chrome at the top
 * of every panel, and repeating them at the foot says nothing the header has
 * not already said.
 *
 * Deliberately almost invisible: a signature, not a message. One quiet line at
 * 8.5px and 55% opacity, with the single spot of colour on the name — painted
 * with the same blue → purple → green ramp the wordmark uses, so the one
 * gradient in the footer reads as a mark rather than as decoration. It comes
 * up to 90% on hover, which rewards a deliberate look without ever demanding
 * one.
 *
 * The hairline above it fades out at both ends rather than running the full
 * width: a hard rule across the foot reads as a cut, a fading one reads as
 * the page trailing off, which is what is actually happening.
 *
 * `mt-auto` inside the shell's flex column is what pins it to the true bottom
 * of a short page. Any slack goes ABOVE the footer, never below it.
 */
export function AppFooter() {
  // Rendered on the server and hydrated as-is. It changes once a year and
  // never mid-session, so there is nothing to reconcile.
  const year = new Date().getFullYear();

  return (
    <footer className="app-foot mt-auto" role="contentinfo">
      <span className="app-foot-rule" aria-hidden="true" />
      {/* One line, not two. Two centred lines at the foot of every page read as
          a block of text the eye has to dismiss; one reads as a signature. */}
      <p className="app-foot-line">
        <span>ACI Motors © {year}</span>
        <span className="app-foot-dot" aria-hidden="true" />
        <span>
          crafted by <span className="app-foot-who">Shahriar</span>
        </span>
      </p>
    </footer>
  );
}
