# ระบบติดตามการตรวจสอบเอกสาร — ฝ่ายเหรัญญิก รุ่น 21
## SUT Medicine Cohort 21 — Treasurer Document Review Tracker

---

## 🚀 ขั้นตอนการ Deploy บน Railway

### ขั้นตอนที่ 1: เตรียม Repository
```bash
cd treasurer-app
git init
git add .
git commit -m "Initial commit"
```

### ขั้นตอนที่ 2: สร้างโปรเจกต์บน Railway
1. ไปที่ [railway.app](https://railway.app) และสร้างบัญชี (ฟรี)
2. คลิก **New Project → Deploy from GitHub repo**
3. เชื่อมต่อ GitHub และเลือก repository นี้

### ขั้นตอนที่ 3: เพิ่ม PostgreSQL
1. ในโปรเจกต์ Railway คลิก **+ New → Database → PostgreSQL**
2. Railway จะสร้าง `DATABASE_URL` ให้อัตโนมัติ

### ขั้นตอนที่ 4: ตั้งค่า Environment Variables
ไปที่ **Service → Variables** และเพิ่ม:

| ตัวแปร | ค่า | หมายเหตุ |
|--------|-----|----------|
| `JWT_SECRET` | (สุ่มสตริงยาว 64+ ตัวอักษร) | สร้างด้วย `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `NODE_ENV` | `production` | |
| `ADMIN_USERNAME` | ชื่อผู้ใช้ที่ต้องการ | ใช้ครั้งแรกเท่านั้น |
| `ADMIN_PASSWORD` | รหัสผ่านเริ่มต้น | **เปลี่ยนทันทีหลัง deploy** |
| `ADMIN_DISPLAY_NAME` | หัวหน้าฝ่ายเหรัญญิก รุ่น 21 | |

### ขั้นตอนที่ 5: รัน Migration และ Seed
ใน Railway Terminal (Service → Shell):
```bash
npm run setup
```

หรือรันแยก:
```bash
npm run migrate   # สร้างตาราง
npm run seed      # สร้าง admin และข้อมูลตัวอย่าง
```

### ขั้นตอนที่ 6: ตรวจสอบการ Deploy
- Railway จะให้ URL อัตโนมัติ เช่น `https://xxx.railway.app`
- เข้า `/login` เพื่อทดสอบ Admin login
- เข้า `/` สำหรับหน้าสาธารณะ

---

## 🖥️ การรันในเครื่อง (Local Development)

```bash
# 1. ติดตั้ง dependencies
npm install

# 2. สร้างไฟล์ .env
cp .env.example .env
# แก้ไขค่าใน .env ให้ถูกต้อง

# 3. ต้องมี PostgreSQL รันอยู่ในเครื่อง
# หรือใช้ Docker:
docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres

# 4. รัน migration และ seed
npm run setup

# 5. เริ่ม server
npm run dev    # development (auto-restart)
npm start      # production
```

เปิด http://localhost:3000

---

## 📖 คู่มือการใช้งาน

### สำหรับผู้ดูแลระบบ (Admin)

**การเข้าสู่ระบบ:**
1. ไปที่ `/login`
2. กรอก Username และ Password
3. คลิก "เข้าสู่ระบบ"
4. ระบบจะพาไปหน้า Dashboard

**การสร้างการติดตามใหม่:**
1. คลิกปุ่ม "สร้างการติดตามใหม่" ที่หน้า Dashboard
2. กรอกชื่อการติดตาม, ชื่อผู้ยื่นเรื่อง, หมายเหตุสาธารณะ
3. คลิก "สร้าง"
4. ระบบจะสร้าง 10 ขั้นตอนมาตรฐานให้อัตโนมัติ

**การอัปเดตขั้นตอน:**
1. คลิกที่การติดตามที่ต้องการ
2. คลิกปุ่ม ✏️ ข้างขั้นตอนที่ต้องการแก้ไข
3. เลือกสถานะ, กรอกวันที่, ผู้รับผิดชอบ, หมายเหตุ
4. เลือก "ตั้งเป็นขั้นตอนปัจจุบัน" ถ้าต้องการ
5. คลิก "บันทึก"

**การแทรกขั้นตอนเร่งด่วน:**
1. คลิกปุ่ม "แทรกขั้นตอน" (สีม่วง)
2. กรอกชื่อขั้นตอนและตำแหน่งที่ต้องการแทรก
3. คลิก "แทรก"
4. ขั้นตอนที่แทรกจะแสดง badge "เพิ่มเติม" สีม่วง

**การดูประวัติการแก้ไข:**
1. คลิกปุ่ม "ประวัติ" หรือ "ประวัติการแก้ไข" ใน sidebar
2. ดู Audit Log ทุกการเปลี่ยนแปลง

**การแชร์ลิงก์:**
1. คลิกปุ่ม "คัดลอกลิงก์" ที่ด้านล่างหน้าแต่ละการติดตาม
2. ส่งลิงก์ให้สมาชิกรุ่น (ลิงก์สาธารณะ ดูได้ไม่ต้องล็อกอิน)

### สำหรับสมาชิก (Viewer)

1. เปิดลิงก์ที่ได้รับ
2. ดูความคืบหน้าและสถานะแต่ละขั้นตอน
3. **ไม่สามารถแก้ไขข้อมูลใดๆ ได้**

---

## 🔒 Checklist ความปลอดภัยก่อน Launch

- [ ] เปลี่ยนรหัสผ่าน Admin ทันทีหลัง deploy (ที่ /admin/settings)
- [ ] ลบตัวแปร `ADMIN_PASSWORD` ออกจาก Railway environment หลัง seed
- [ ] ทดสอบว่า public endpoint ไม่ส่ง private_note และข้อมูลส่วนตัว
- [ ] ทดสอบ API `/api/records` โดยไม่มี cookie (ต้องได้ 401)
- [ ] ทดสอบ API `/api/records/:id` โดยไม่มี cookie (ต้องได้ 401)
- [ ] ทดสอบ `/api/records/:id/public` ส่งเฉพาะ public fields
- [ ] ทดสอบว่าลบตัวอย่าง `[ตัวอย่าง]` ออกได้ (เปลี่ยน status เป็น cancelled หรือลบจาก DB)

---

## 🧪 Acceptance Tests

| # | Test | วิธีทดสอบ |
|---|------|-----------|
| 1 | Admin login | เข้า /login กรอก credentials คลิก login |
| 2 | Data persists | อัปเดตขั้นตอน reload หน้า ข้อมูลต้องยังอยู่ |
| 3 | Cross-device | เปิดหน้า /track/:id บนมือถืออีกเครื่อง |
| 4 | Viewer can't edit | ลอง PUT /api/records/:id โดยไม่มี cookie → ต้องได้ 401 |
| 5 | Private fields hidden | GET /api/records/:id/public ต้องไม่มี private_note |
| 6 | Insert stage | แทรกขั้นตอน → ขั้นตอนเดิมยังครบ 10 ขั้น |
| 7 | Audit log | แก้ไขขั้นตอน → ดู Audit Log → ต้องมีบันทึก |
| 8 | No self-registration | ไม่มี endpoint POST /api/auth/register |
| 9 | Mobile responsive | เปิดบน Chrome DevTools mobile view |
| 10 | Railway deploy | ทำตามขั้นตอน deploy ด้านบน |

---

## 📂 โครงสร้างไฟล์

```
treasurer-app/
├── src/
│   ├── server.js          # Express server
│   ├── db.js              # PostgreSQL pool
│   ├── middleware/
│   │   └── auth.js        # JWT middleware
│   ├── routes/
│   │   ├── auth.js        # /api/auth/*
│   │   └── records.js     # /api/records/*
│   └── views/
│       ├── partials/head.ejs
│       ├── public/
│       │   ├── index.ejs  # หน้ารายการ (สาธารณะ)
│       │   └── track.ejs  # หน้าติดตาม (สาธารณะ)
│       └── admin/
│           ├── login.ejs
│           ├── dashboard.ejs
│           ├── record-detail.ejs
│           └── settings.ejs
├── public/css/main.css    # Stylesheet
├── db/
│   ├── migrate.js         # สร้างตาราง
│   └── seed.js            # ข้อมูลเริ่มต้น
├── .env.example
├── .gitignore
├── package.json
└── railway.json
```
