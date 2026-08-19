import { loadEnvFile } from "node:process";
import { defineConfig, env } from "prisma/config";

// Prisma 7 stores the connection URL in this config file rather than schema.prisma.
loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
