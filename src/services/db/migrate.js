const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

function getEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function run() {
  const pool = new Pool({
    host: getEnv("NEON_DB_HOST"),
    port: Number(getEnv("NEON_DB_PORT", "5432")),
    user: getEnv("NEON_DB_USERNAME"),
    password: getEnv("NEON_DB_PASSWORD"),
    database: getEnv("NEON_DB_NAME", "neondb"),
    max: Number(getEnv("NEON_DB_POOL_MAX", "10")),
    idleTimeoutMillis: Number(getEnv("NEON_DB_IDLE_TIMEOUT_MS", "30000")),
    ssl: getEnv("NEON_DB_SSL", "true") === "true" ? { rejectUnauthorized: false } : false
  });

  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  await pool.end();

  console.log("Schema migration completed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
