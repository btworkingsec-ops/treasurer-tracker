const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

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

async function logAudit(client, { record_id, stage_id, user_id, action, old_value, new_value, description, ip }) {
  await client.query(
    `INSERT INTO audit_logs (record_id, stage_id, user_id, action, old_value, new_value, description, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [record_id, stage_id, user_id, action, JSON.stringify(old_value), JSON.stringify(new_value), description, ip]
  );
}

// GET /api/records — admin list
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.display_name as creator_name,
        (SELECT COUNT(*) FROM workflow_stages ws WHERE ws.record_id = r.id AND ws.status = 'completed') as completed_stages,
        (SELECT COUNT(*) FROM workflow_stages ws WHERE ws.record_id = r.id) as total_stages
      FROM tracking_records r LEFT JOIN users u ON r.created_by = u.id
      ORDER BY r.updated_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/records/public — viewer safe
router.get('/public', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, requester_name, public_note, status, current_stage_id, updated_at
      FROM tracking_records WHERE status = 'active'
      ORDER BY updated_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// POST /api/records — create new record
router.post('/', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { title, description, requester_name, public_note } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'กรุณากรอกชื่อการติดตาม' });

    await client.query('BEGIN');

    const recordResult = await client.query(
      `INSERT INTO tracking_records (title, description, requester_name, public_note, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [title.trim(), description?.trim(), requester_name?.trim(), public_note?.trim(), req.user.id]
    );
    const recordId = recordResult.rows[0].id;

    for (let i = 0; i < DEFAULT_STAGES.length; i++) {
      await client.query(
        `INSERT INTO workflow_stages (record_id, title, title_en, display_order, stage_type)
         VALUES ($1, $2, $3, $4, 'standard')`,
        [recordId, DEFAULT_STAGES[i].title, DEFAULT_STAGES[i].title_en, i + 1]
      );
    }

    await logAudit(client, { record_id: recordId, user_id: req.user.id, action: 'CREATE_RECORD', new_value: { title }, description: `สร้างการติดตามใหม่: ${title}`, ip: req.ip });

    await client.query('COMMIT');
    res.status(201).json({ id: recordId, message: 'สร้างการติดตามสำเร็จ' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  } finally {
    client.release();
  }
});

// GET /api/records/:id — admin full detail
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [recordResult, stagesResult] = await Promise.all([
      pool.query('SELECT r.*, u.display_name as creator_name FROM tracking_records r LEFT JOIN users u ON r.created_by = u.id WHERE r.id = $1', [id]),
      pool.query('SELECT * FROM workflow_stages WHERE record_id = $1 ORDER BY display_order', [id]),
    ]);
    if (!recordResult.rows[0]) return res.status(404).json({ error: 'ไม่พบข้อมูล' });
    res.json({ record: recordResult.rows[0], stages: stagesResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/records/:id/public — viewer safe detail
router.get('/:id/public', async (req, res) => {
  try {
    const { id } = req.params;
    const [recordResult, stagesResult] = await Promise.all([
      pool.query('SELECT id, title, requester_name, public_note, status, current_stage_id, updated_at FROM tracking_records WHERE id = $1 AND status = $2', [id, 'active']),
      pool.query('SELECT id, title, display_order, stage_type, status, public_note, action_date, responsible_person FROM workflow_stages WHERE record_id = $1 ORDER BY display_order', [id]),
    ]);
    if (!recordResult.rows[0]) return res.status(404).json({ error: 'ไม่พบข้อมูล' });
    res.json({ record: recordResult.rows[0], stages: stagesResult.rows });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// PUT /api/records/:id — update record metadata
router.put('/:id', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { title, description, requester_name, public_note, status } = req.body;
    await client.query('BEGIN');

    const old = await client.query('SELECT * FROM tracking_records WHERE id = $1', [id]);
    if (!old.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ไม่พบข้อมูล' }); }

    await client.query(
      `UPDATE tracking_records SET title=$1, description=$2, requester_name=$3, public_note=$4, status=$5, updated_at=NOW() WHERE id=$6`,
      [title?.trim() || old.rows[0].title, description?.trim(), requester_name?.trim(), public_note?.trim(), status || old.rows[0].status, id]
    );

    await logAudit(client, { record_id: parseInt(id), user_id: req.user.id, action: 'UPDATE_RECORD', old_value: old.rows[0], new_value: req.body, description: 'อัปเดตข้อมูลการติดตาม', ip: req.ip });

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  } finally {
    client.release();
  }
});

// PUT /api/records/:id/stages/:stageId — update stage
router.put('/:id/stages/:stageId', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, stageId } = req.params;
    const { status, public_note, private_note, action_date, responsible_person, set_current } = req.body;

    await client.query('BEGIN');

    const old = await client.query('SELECT * FROM workflow_stages WHERE id = $1 AND record_id = $2', [stageId, id]);
    if (!old.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ไม่พบขั้นตอน' }); }

    await client.query(
      `UPDATE workflow_stages SET status=COALESCE($1, status), public_note=$2, private_note=$3,
       action_date=$4, responsible_person=$5, updated_at=NOW() WHERE id=$6 AND record_id=$7`,
      [status, public_note, private_note, action_date || null, responsible_person, stageId, id]
    );

    if (set_current) {
      await client.query('UPDATE tracking_records SET current_stage_id = $1, updated_at = NOW() WHERE id = $2', [stageId, id]);
    }

    await logAudit(client, {
      record_id: parseInt(id), stage_id: parseInt(stageId), user_id: req.user.id,
      action: 'UPDATE_STAGE', old_value: old.rows[0], new_value: req.body,
      description: `อัปเดตขั้นตอน: ${old.rows[0].title} → ${status || old.rows[0].status}`, ip: req.ip
    });

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  } finally {
    client.release();
  }
});

// POST /api/records/:id/stages — insert priority stage
router.post('/:id/stages', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { title, insert_after_order, public_note, private_note } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'กรุณากรอกชื่อขั้นตอน' });

    await client.query('BEGIN');

    const insertOrder = (insert_after_order || 0) + 0.5;
    await client.query(
      `INSERT INTO workflow_stages (record_id, title, display_order, stage_type, public_note, private_note)
       VALUES ($1, $2, $3, 'inserted', $4, $5)`,
      [id, title.trim(), insertOrder, public_note?.trim(), private_note?.trim()]
    );

    // Re-normalize display orders
    const stages = await client.query('SELECT id FROM workflow_stages WHERE record_id = $1 ORDER BY display_order', [id]);
    for (let i = 0; i < stages.rows.length; i++) {
      await client.query('UPDATE workflow_stages SET display_order = $1 WHERE id = $2', [i + 1, stages.rows[i].id]);
    }

    await logAudit(client, { record_id: parseInt(id), user_id: req.user.id, action: 'INSERT_STAGE', new_value: { title, insert_after_order }, description: `แทรกขั้นตอนเร่งด่วน: ${title}`, ip: req.ip });

    await client.query('COMMIT');
    res.status(201).json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  } finally {
    client.release();
  }
});

// PUT /api/records/:id/stages/:stageId/reorder
router.put('/:id/stages/:stageId/reorder', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, stageId } = req.params;
    const { new_order } = req.body;
    await client.query('BEGIN');

    const stage = await client.query('SELECT * FROM workflow_stages WHERE id = $1 AND record_id = $2', [stageId, id]);
    if (!stage.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ไม่พบขั้นตอน' }); }

    const oldOrder = stage.rows[0].display_order;
    if (new_order > oldOrder) {
      await client.query('UPDATE workflow_stages SET display_order = display_order - 1 WHERE record_id = $1 AND display_order > $2 AND display_order <= $3', [id, oldOrder, new_order]);
    } else {
      await client.query('UPDATE workflow_stages SET display_order = display_order + 1 WHERE record_id = $1 AND display_order >= $2 AND display_order < $3', [id, new_order, oldOrder]);
    }
    await client.query('UPDATE workflow_stages SET display_order = $1, updated_at = NOW() WHERE id = $2', [new_order, stageId]);

    await logAudit(client, { record_id: parseInt(id), stage_id: parseInt(stageId), user_id: req.user.id, action: 'REORDER_STAGE', old_value: { order: oldOrder }, new_value: { order: new_order }, description: `เปลี่ยนลำดับขั้นตอน`, ip: req.ip });

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  } finally {
    client.release();
  }
});

// GET /api/records/:id/audit — audit log
router.get('/:id/audit', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.display_name as user_name FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id
       WHERE a.record_id = $1 ORDER BY a.created_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// DELETE /api/records/:id/stages/:stageId — delete inserted stage only
router.delete('/:id/stages/:stageId', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, stageId } = req.params;
    await client.query('BEGIN');

    const stage = await client.query('SELECT * FROM workflow_stages WHERE id = $1 AND record_id = $2', [stageId, id]);
    if (!stage.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ไม่พบขั้นตอน' }); }
    if (stage.rows[0].stage_type !== 'inserted') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'ไม่สามารถลบขั้นตอนมาตรฐานได้' }); }

    await client.query('DELETE FROM workflow_stages WHERE id = $1', [stageId]);
    await logAudit(client, { record_id: parseInt(id), user_id: req.user.id, action: 'DELETE_STAGE', old_value: stage.rows[0], description: `ลบขั้นตอนที่แทรก: ${stage.rows[0].title}`, ip: req.ip });

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  } finally {
    client.release();
  }
});

module.exports = router;
