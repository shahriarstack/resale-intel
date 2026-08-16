import NextAuth, { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        id: { label: "User ID", type: "text" },
        employeeId: { label: "Employee ID", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.id || !credentials?.employeeId) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: {
            id: credentials.id
          }
        });

        // Simple match on employeeId (treat as password based on Sales 360 mechanism)
        if (user && user.employeeId === credentials.employeeId) {
          return {
            id: user.id,
            name: user.name,
            role: user.role,
            area: user.area,
            employeeId: user.employeeId
          };
        }

        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.id = user.id;
        token.area = (user as any).area;
        token.employeeId = (user as any).employeeId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
        (session.user as any).area = token.area;
        (session.user as any).employeeId = token.employeeId;
      }
      return session;
    }
  },
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login",
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
