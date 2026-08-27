import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";

// JWT sessions with a Credentials provider. No database adapter: the login
// handle is the Staff ID and the secret is a bcrypt hash, verified here.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Staff ID",
      credentials: {
        staffId: { label: "Staff ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const staffId = credentials?.staffId?.trim();
        const password = credentials?.password;
        if (!staffId || !password) return null;

        const user = await prisma.user.findUnique({ where: { staffId } });
        if (!user || !user.isActive) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name,
          staffId: user.staffId,
          role: user.role,
          territoryId: user.territoryId,
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
        token.territoryId = (user as { territoryId: string | null }).territoryId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.staffId = token.staffId as string;
        session.user.territoryId = (token.territoryId as string | null) ?? null;
      }
      return session;
    },
  },
};
