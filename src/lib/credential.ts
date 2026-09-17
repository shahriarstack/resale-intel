import bcrypt from "bcryptjs";

/**
 * The sign-in credential.
 *
 * A person's Staff ID is what they sign in with. There is no separately chosen
 * password anywhere in the product: the admin console does not offer a field
 * for one, the bulk import does not carry a column for one, and changing
 * somebody's Staff ID changes what they sign in with, in the same write.
 *
 * ONE FUNCTION, because the rule is only true if it is true everywhere. Four
 * places write a `passwordHash` — create, edit, bulk import and the alignment
 * script — and the moment one of them derives it differently, an account
 * exists that cannot sign in and nobody can say why. They all call this.
 *
 * WHAT THIS COSTS, recorded here because it is the kind of decision a system
 * gets asked about later: a Staff ID is not a secret. It is printed on the
 * user list, exported in the data room (`Opened By Staff ID` is a column),
 * shown beside every offer and read aloud in the yard. Anyone who knows one can
 * sign in as that person, and the audit trail — which is this product's central
 * claim — cannot then distinguish the named officer from anyone who has seen
 * their ID. This was asked for deliberately; it is written down so the trade is
 * visible rather than discovered.
 *
 * It is still hashed with bcrypt rather than stored or compared in the clear.
 * The credential being guessable is a decision; the database also holding it in
 * plain text would be a second, separate mistake on top of it.
 */

/**
 * The stored form of a Staff ID.
 *
 * Trimmed, because a trailing space pasted into the admin form would otherwise
 * mint an account whose credential nobody can type. Case is preserved: the
 * admin chose it, and it is displayed on every screen in the product.
 */
export function normaliseStaffId(staffId: string): string {
  return staffId.trim();
}

/**
 * The form that gets hashed and compared — trimmed AND upper-cased.
 *
 * Separate from the stored form, and the difference is load-bearing. The
 * `staffId` column is `utf8mb4_unicode_ci`, so `WHERE staffId = 'dm-01'` finds
 * `DM-01` — the database folds case for us. **bcrypt does not.** Hashing the
 * stored casing therefore admitted the lookup and then refused the comparison:
 * an officer who typed their own ID in lower case on a phone keyboard was told
 * their passcode was wrong, by a system that had just found their account.
 *
 * Folding here makes the credential agree with the lookup that precedes it.
 * Two accounts cannot collide as a result, because the column's own collation
 * already forbids `dm-01` and `DM-01` from both existing.
 */
export function credentialKey(staffId: string): string {
  return normaliseStaffId(staffId).toUpperCase();
}

/** The hash to store for this Staff ID. */
export function credentialHash(staffId: string): Promise<string> {
  return bcrypt.hash(credentialKey(staffId), 10);
}

/**
 * A hash of something that matches nothing.
 *
 * Compared against when no account is found, so a sign-in attempt for an
 * unknown Staff ID takes the same time as one for a known ID with the wrong
 * role. Without it the response time answers "does this Staff ID exist" to
 * anyone willing to time it.
 */
export const DECOY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
