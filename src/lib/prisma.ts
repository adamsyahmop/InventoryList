import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma CLI me-resolve `file:./dev.db` relatif terhadap `prisma7.config.ts`
 * (root project), sedangkan driver adapter me-resolve relatif terhadap
 * `process.cwd()`. Supaya CLI dan runtime dijamin menunjuk file database yang
 * SAMA (tidak diam-diam membuat database kedua), path relatif kita jadikan
 * absolut di satu tempat ini.
 */
function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";

  if (!raw.startsWith("file:") || raw.includes(":memory:")) {
    return raw;
  }

  const filePath = raw.slice("file:".length);
  if (path.isAbsolute(filePath)) {
    return raw;
  }

  return `file:${path.resolve(/* turbopackIgnore: true */ process.cwd(), filePath)}`;
}

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

/**
 * Reuse instance di development supaya hot reload tidak membuka
 * koneksi SQLite baru terus-menerus.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
