const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// 1. CONNECT TO CLOUD DATABASE (NEON)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true } // Required for cloud databases
});

pool.connect((err) => {
    if (err) console.error("Veritabanı bağlantı hatası:", err.message);
    else console.log("Bulut veritabanına (Neon) başarıyla bağlanıldı!");
});

// 2. BUILD SQL TABLES (PostgreSQL Syntax)
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ogrenciler (
                id SERIAL PRIMARY KEY,
                ad_soyad TEXT UNIQUE,
                sifre TEXT
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notlar (
                id SERIAL PRIMARY KEY,
                ogrenci_id INTEGER REFERENCES ogrenciler(id),
                bolum INTEGER,
                dogru INTEGER,
                yanlis INTEGER
            );
        `);
        console.log("Tablolar hazır.");
    } catch (err) {
        console.error("Tablo oluşturma hatası:", err.message);
    }
};
initDB();

// --- API ENDPOINTS ---

// SIGN UP API
app.post('/api/signup', async (req, res) => {
    const { name, password } = req.body;
    const nameKey = name.toLowerCase();

    try {
        const result = await pool.query(
            `INSERT INTO ogrenciler (ad_soyad, sifre) VALUES ($1, $2) RETURNING id`, 
            [nameKey, password]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        if (err.code === '23505') { // Postgres unique violation code
            return res.status(400).json({ error: "Bu isimde bir hesap zaten var." });
        }
        res.status(500).json({ error: "Veritabanı hatası." });
    }
});

// LOG IN API
app.post('/api/login', async (req, res) => {
    const { name, password } = req.body;
    const nameKey = name.toLowerCase();

    try {
        const result = await pool.query(
            `SELECT * FROM ogrenciler WHERE ad_soyad = $1 AND sifre = $2`, 
            [nameKey, password]
        );
        if (result.rows.length === 0) return res.status(401).json({ error: "Hatalı Ad Soyad veya Şifre." });
        
        res.json({ success: true, studentId: result.rows[0].id, name: result.rows[0].ad_soyad });
    } catch (err) {
        res.status(500).json({ error: "Veritabanı hatası." });
    }
});

// SAVE GRADE API (End of Chapter)
app.post('/api/grades', async (req, res) => {
    const { studentId, chapter, correct, wrong } = req.body;

    try {
        const check = await pool.query(
            `SELECT id FROM notlar WHERE ogrenci_id = $1 AND bolum = $2`, 
            [studentId, chapter]
        );

        if (check.rows.length > 0) {
            await pool.query(
                `UPDATE notlar SET dogru = $1, yanlis = $2 WHERE id = $3`, 
                [correct, wrong, check.rows[0].id]
            );
        } else {
            await pool.query(
                `INSERT INTO notlar (ogrenci_id, bolum, dogru, yanlis) VALUES ($1, $2, $3, $4)`, 
                [studentId, chapter, correct, wrong]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Not kaydedilemedi." });
    }
});

// FETCH STUDENT GRADES API
app.get('/api/grades/:studentId', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT bolum AS chapter, dogru AS correct, yanlis AS wrong FROM notlar WHERE ogrenci_id = $1`, 
            [req.params.studentId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Notlar getirilemedi." });
    }
});

// TEACHER DASHBOARD API
app.get('/api/teacher/all-grades', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ogrenciler.ad_soyad, notlar.bolum, notlar.dogru, notlar.yanlis 
            FROM notlar 
            JOIN ogrenciler ON notlar.ogrenci_id = ogrenciler.id
            ORDER BY ogrenciler.ad_soyad, notlar.bolum
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`DİLMER Backend çalışıyor: Port ${PORT}`);
});