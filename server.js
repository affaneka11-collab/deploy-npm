const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Inisialisasi database SQLite
const db = new sqlite3.Database('./accounts.db', (err) => {
    if (err) console.error(err.message);
    console.log('Connected to SQLite database.');
});

// Buat tabel jika belum ada
db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    delet BOOLEAN DEFAULT 0
)`);

// Fungsi untuk inisialisasi akun default
function initializeDefaultAccounts() {
    const defaultAccounts = [
        { username: "affan", password: "affaneka1412", role: "admin" },
        { username: "mod", password: "mod123", role: "moderator" }
    ];

    db.get('SELECT COUNT(*) AS count FROM accounts', [], (err, row) => {
        if (err) console.error(err.message);
        if (row.count === 0) {
            defaultAccounts.forEach(account => {
                const hashedPassword = bcrypt.hashSync(account.password, 10); // Hash password
                db.run('INSERT INTO accounts (username, password, role, delet) VALUES (?, ?, ?, 0)',
                    [account.username, hashedPassword, account.role], (err) => {
                        if (err) console.error(err.message);
                    });
            });
            console.log('Default accounts inserted.');
        }
    });
}
initializeDefaultAccounts();

// Endpoint login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM accounts WHERE username = ? AND delet = 0', [username], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row && bcrypt.compareSync(password, row.password)) {
            res.json({ success: true, role: row.role, message: 'Login berhasil!' });
        } else {
            res.json({ success: false, message: 'Username atau password salah.', print: username , password });
        }
    });
});

// Endpoint untuk daftar akun baru (opsional)
app.post('/register', (req, res) => {
    const { username, password, role } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO accounts (username, password, role, delet) VALUES (?, ?, ?, 0)',
        [username, hashedPassword, role], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Akun berhasil dibuat!' });
        });
});

// Endpoint untuk ganti password (hanya untuk user yang login)
app.post('/change-password', (req, res) => {
    const { username, oldPassword, newPassword } = req.body;
    // Verifikasi oldPassword, lalu update dengan hash baru
    // (Implementasi lengkap diperlukan)
    res.json({ success: true, message: 'Password berhasil diubah!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});