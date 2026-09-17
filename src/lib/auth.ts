import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { DECOY_HASH, credentialKey, normaliseStaffId } from "./credential";

/**
 * JWT sessions with a Credentials provider. No database adapter.
 *
 * Sign-in is a ROLE and a passcode. The role is picked from a list; the
 * passcode is the person's Staff ID, which is also what identifies them — so
 * the two fields together say who you are and which desk you are claiming, and
 * the second is enough to find the row.
 *
 * The role is not decoration. It is checked against the account, so picking
 * the wrong one fails: an ARO who selects "Recovery Operations HQ" does not
 * get in and then find a console they cannot use.
 *
 * The lookup finds the row; `bcrypt.compare` is still what admits it. That
 * order matters for accounts whose stored hash has drifted from their Staff ID
 * — an unaligned row must fail to sign in rather than be waved through on the
 * strength of the lookup alone. The stored hash is the authority.
 */
export const authOptions: NextAuthOptions = {
  /**
   * SIGNING IN ONCE IS SIGNING IN.
   *
   * NextAuth defaults to a 30-day session but the field roles never saw it:
   * the app is installed to a home screen (`display: standalone`), and the
   * thing that actually ends a session on a phone is the OS reclaiming memory
   * and the tab being rebuilt from cold. What matters is that the cookie is
   * PERSISTENT — written with an expiry rather than for the life of the
   * browser process — which is what `maxAge` on the session makes it.
   *
   * 60 days, and rolling: `updateAge` re-issues the token a day at a time, so
   * somebody who opens the app most weeks is never signed out, while an
   * account that goes quiet for two months stops being a live credential
   * sitting on a phone in a yard. A session that never expires at all is not a
   * convenience, it is a lost handset.
   *
   * The token carries the role and the postings, so re-issuing it is also what
   * picks up a territory reassigned in the admin console without the officer
   * having to sign out and back in.
   */
  session: {
    strategy: "jwt",
    maxAge: 60 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  jwt: { maxAge: 60 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Staff ID",
      credentials: {
        role: { label: "Role", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const role = credentials?.role?.trim();
        const passcode = normaliseStaffId(credentials?.password ?? "");
        if (!role || !passcode) return null;

        const user = await prisma.user.findUnique({
          where: { staffId: passcode },
          // Postings come along at sign-in so the token can carry every
          // territory this person works — base and cover alike. Read once
          // here rather than on each request that needs to scope by it.
          include: { postings: { select: { territoryId: true, kind: true } } },
        });

        // Every path below spends one bcrypt comparison, including the ones
        // that have already failed. A short-circuit here would let anyone
        // discover which Staff IDs exist by timing the response.
        // Upper-cased for the comparison, matching how the hash was stored —
        // the lookup above folds case through the column's collation and
        // bcrypt does not. See lib/credential.ts.
        const ok = await bcrypt.compare(
          credentialKey(passcode),
          user?.passwordHash ?? DECOY_HASH,
        );

        if (!user || !ok) return null;
        if (!user.isActive) return null;
        // The desk they claimed has to be the desk they hold.
        if (user.role !== role) return null;

        return {
          id: user.id,
          name: user.name,
          staffId: user.staffId,
          role: user.role,
          territoryIds: user.postings.map((p) => p.territoryId),
          baseTerritoryId:
            user.postings.find((p) => p.kind === "BASE")?.territoryId ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: Role }).role;
        token.staffId = (user as { staffId: string }).staffId;
        token.territoryIds = (user as { territoryIds?: string[] }).territoryIds ?? [];
        token.baseTerritoryId =
          (user as { baseTerritoryId?: string | null }).baseTerritoryId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.staffId = token.staffId as string;
        session.user.territoryIds = (token.territoryIds as string[] | undefined) ?? [];
        session.user.baseTerritoryId =
          (token.baseTerritoryId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
};
