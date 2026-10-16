require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

const DEFAULT_STAGES = [
  { title: 'รับเรื่องทางอีเมล และรับใบเสร็จทาง LINE', title_en: 'Receive request via email and receipt via LINE' },
  { title: 'เบิกจ่ายเงินสำรองฉุกเฉินจากกองทุนสำรองส่วนกลาง', title_en: 'Process urgent disbursement from emergency common fund reserve' },
  { title: 'บันทึกวันที่ส่งเอกสารให้เหรัญญิก', title_en: 'Record the date documents were submitted to the treasurer' },
  { title: 'ตรวจสอบเอกสาร — กรณีที่ 2', title_en: 'Review documents — Case 2' },
  { title: 'ตรวจสอบเอกสาร — กรณีที่ 1', title_en: 'Review documents — Case 1' },
  { title: 'ดำเนินการขอเบิกจ่าย — กรณีที่ 2', title_en: 'Process disbursement request — Case 2' },
  { title: 'ดำเนินการขอเบิกจ่าย — กรณีที่ 1', title_en: 'Process disbursement request — Case 1' },
  { title: 'ตรวจสอบบันทึกข้อความ ปกรย. (เพิ่มวงเงิน)', title_en: 'Review official memorandum requesting additional approval (PGRY)' },
  { title: 'ตรวจสอบบันทึกข้อความ ปกอพ. (ขอรายละเอียดเพิ่มเติม)', title_en: 'Review official memorandum returned for more specific supporting details (PGOP)' },
  { title: 'นำบันทึก ปกรย. และ ปกอพ. กลับเข้าสู่กระบวนการเบิกจ่าย', title_en: 'Re-enter PGRY and PGOP memoranda into the disbursement processing workflow' },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create admin user
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    const displayName = process.env.ADMIN_DISPLAY_NAME || 'หัวหน้าฝ่ายเหรัญญิก รุ่น 21';

    const existing = await client.query('SELECT id FROM users WHERE username = $1', [username]);
    let userId;
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(password, 12);
      const result = await client.query(
        'INSERT INTO users (username, password_hash, display_name, role) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, hash, displayName, 'admin']
      );
      userId = result.rows[0].id;
      console.log(`✅ Admin user created: ${username}`);
    } else {
      userId = existing.rows[0].id;
      console.log(`ℹ️  Admin user already exists: ${username}`);
    }

    // Create sample tracking record
    const existingRecord = await client.query('SELECT id FROM tracking_records WHERE title LIKE $1', ['[ตัวอย่าง]%']);
    if (existingRecord.rows.length === 0) {
      const recordResult = await client.query(
        `INSERT INTO tracking_records (title, description, requester_name, public_note, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          '[ตัวอย่าง] การเบิกจ่ายค่าอุปกรณ์จัดกิจกรรม',
          'ข้อมูลตัวอย่างสำหรับการทดสอบระบบ — ไม่ใช่ข้อมูลจริง',
          'ฝ่ายกิจกรรม รุ่น 21',
          'อยู่ระหว่างการตรวจสอบเอกสาร',
          userId
        ]
      );
      const recordId = recordResult.rows[0].id;

      for (let i = 0; i < DEFAULT_STAGES.length; i++) {
        const stage = DEFAULT_STAGES[i];
        let status = 'pending';
        if (i === 0) status = 'completed';
        if (i === 1) status = 'in_progress';

        await client.query(
          `INSERT INTO workflow_stages (record_id, title, title_en, display_order, status, stage_type)
           VALUES ($1, $2, $3, $4, $5, 'standard')`,
          [recordId, stage.title, stage.title_en, i + 1, status]
        );
      }

      // Set current stage
      const inProgressStage = await client.query(
        'SELECT id FROM workflow_stages WHERE record_id = $1 AND status = $2 LIMIT 1',
        [recordId, 'in_progress']
      );
      if (inProgressStage.rows.length > 0) {
        await client.query('UPDATE tracking_records SET current_stage_id = $1 WHERE id = $2', [inProgressStage.rows[0].id, recordId]);
      }

      console.log('✅ Sample tracking record created');
    }

    await client.query('COMMIT');
    console.log('✅ Seed completed');
    console.log(`\n⚠️  IMPORTANT: Change the admin password immediately after first login!`);
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
