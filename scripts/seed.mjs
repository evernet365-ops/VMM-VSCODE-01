import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://evernet:evernet@localhost:5432/evernet_vmm";
const seedPath = path.resolve("db/seed/seed.sql");
const pool = new Pool({ connectionString });

async function main() {
  const sql = fs.readFileSync(seedPath, "utf8");
  await pool.query(sql);
  console.log("seed applied");
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
