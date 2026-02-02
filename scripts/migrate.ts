import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function migrate() {
  console.log("Creating agent_health table...");
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_health (
      agent_id BIGINT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'unknown',
      last_checked_at TIMESTAMP,
      last_healthy_at TIMESTAMP,
      latency_ms INTEGER,
      error_message TEXT,
      http_status INTEGER,
      mcp_valid BOOLEAN,
      mcp_tools_count INTEGER,
      mcp_error TEXT,
      a2a_valid BOOLEAN,
      a2a_skills_count INTEGER,
      a2a_error TEXT,
      x402_price TEXT,
      x402_currency TEXT
    );
  `);
  
  console.log("Migration complete!");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
