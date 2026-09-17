import { accountOf } from "@/lib/vehicle";

/**
 * The heading on an operations record: who it is about.
 *
 * A component rather than a string, because the two halves are typeset
 * differently and truncate differently — see `accountOf` for why — and that is
 * a decision nine call sites were each about to make on their own. Made once
 * here, a customer heading reads the same on the officer's phone, in the
 * manager's inbox, on the engineer's bench and at the top of the vehicle file,
 * and the code can never be the half that gets cut.
 *
 * The caller still owns the TYPE. Each surface has its own scale — the field
 * panel's `.f-item`, the desk's 13px rows — so `className` lands on the name,
 * which is the part carrying that scale, while the code keeps its own mono
 * sizing relative to it.
 */
export function AccountTitle({
  record,
  className = "",
  as: Tag = "h3",
}: {
  record: { customerCode?: string | null; customerName?: string | null };
  /** Type scale for the NAME. The code sizes itself from it. */
  className?: string;
  as?: "h3" | "h2" | "div" | "span";
}) {
  const a = accountOf(record);

  return (
    <Tag className={`acct-title ${className}`}>
      {a.code && <span className="acct-code">{a.code}</span>}
      <span className="acct-name">{a.name}</span>
    </Tag>
  );
}
