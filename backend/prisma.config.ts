import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  engine: "library", // 指定使用 library 引擎
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
