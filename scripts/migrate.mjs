import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://evernet:evernet@localhost:5432/evernet_vmm";
const migrationDir = path.resolve("db/migrations");

const pool = new Pool({ connectionString });

async function main() {
  await pool.query(`
    create table if not exists schema_migration (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = fs
    .readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const applied = await pool.query("select 1 from schema_migration where id = $1", [file]);
    if (applied.rowCount && applied.rowCount > 0) {
      console.log(`skip migration ${file}`);
      continue;
    }

    const fullPath = path.join(migrationDir, file);
    const sql = fs.readFileSync(fullPath, "utf8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("insert into schema_migration (id) values ($1)", [file]);
      await pool.query("commit");
      console.log(`applied migration ${file}`);
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }
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
