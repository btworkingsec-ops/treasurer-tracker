require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(200) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tracking_records (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        requester_name VARCHAR(200),
        public_note TEXT,
        current_stage_id INTEGER,
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_stages (
        id SERIAL PRIMARY KEY,
        record_id INTEGER REFERENCES tracking_records(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        title_en VARCHAR(500),
        display_order INTEGER NOT NULL,
        stage_type VARCHAR(20) DEFAULT 'standard' CHECK (stage_type IN ('standard', 'inserted')),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'awaiting_docs')),
        public_note TEXT,
        private_note TEXT,
        action_date DATE,
        responsible_person VARCHAR(200),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        record_id INTEGER REFERENCES tracking_records(id) ON DELETE SET NULL,
        stage_id INTEGER,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        old_value JSONB,
        new_value JSONB,
        description TEXT,
        ip_address INET,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_workflow_stages_record_id ON workflow_stages(record_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)`);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
