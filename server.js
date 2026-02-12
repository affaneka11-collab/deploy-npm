const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        console.log('Raw body received:', buf.toString());
    }
}));

// Middleware timeout
app.use((req, res, next) => {
    res.setTimeout(10000, () => {
        console.log('Request timeout for:', req.url);
        res.status(504).json({ error: 'Gateway Timeout' });
    });
    next();
});

// Inisialisasi DB
const db = new sqlite3.Database('./accounts.db', (err) => {
    if (err) console.error('DB error:', err.message);
    console.log('Connected to SQLite.');
});

// tabel akun!
db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    delet BOOLEAN DEFAULT 0,
    active BOOLEAN DEFAULT 1 
)`);

db.run(`CREATE TABLE IF NOT EXISTS prestasi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL
)`);
db.run(`CREATE TABLE IF NOT EXISTS karya (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL
)`);

// Inisialisasi akun default
function initializeDefaultAccounts() {
    const defaultAccounts = [
        { username: "affan", password: "affaneka1412", role: "admin" },
        { username: "mod", password: "mod123", role: "moderator" }
    ];
    db.get('SELECT COUNT(*) AS count FROM accounts', [], (err, row) => {
        if (err) console.error('Count error:', err.message);
        if (row.count === 0) {
            defaultAccounts.forEach(account => {
                const hashedPassword = bcrypt.hashSync(account.password, 10);
                db.run('INSERT INTO accounts (username, password, role, delet, active) VALUES (?, ?, ?, 0, 1)',
                    [account.username, hashedPassword, account.role], (err) => {
                        if (err) console.error('Insert error:', err.message);
                    });
            });
            console.log('Default accounts inserted.');
        }
    });
}
initializeDefaultAccounts();

function initializeDefaultAccounts() {
    db.get('SELECT COUNT(*) AS count FROM accounts', [], (err, row) => {
        if (err) {
            console.error('Count query error:', err.message);
            // Fallback: Buat tabel jika tidak ada
            db.run(`CREATE TABLE accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                delet BOOLEAN DEFAULT 0,
                active BOOLEAN DEFAULT 1
            )`, (err) => {
                if (err) console.error('Create table error:', err);
                else {
                    console.log('Table created.');
                    // Insert default setelah create
                    const defaultAccounts = [
                        { username: "affan", password: "affaneka1412", role: "admin" },
                        { username: "mod", password: "mod123", role: "moderator" }
                    ];
                    defaultAccounts.forEach(account => {
                        const hashedPassword = bcrypt.hashSync(account.password, 10);
                        db.run('INSERT INTO accounts (username, password, role, delet, active) VALUES (?, ?, ?, 0, 1)',
                            [account.username, hashedPassword, account.role], (err) => {
                                if (err) console.error('Insert error:', err.message);
                            });
                    });
                    console.log('Default accounts inserted.');
                }
            });
            return;
        }
        if (row.count === 0) {
            const defaultAccounts = [
                { username: "affan", password: "affaneka1412", role: "admin" },
                { username: "mod", password: "mod123", role: "moderator" }
            ];
            defaultAccounts.forEach(account => {
                const hashedPassword = bcrypt.hashSync(account.password, 10);
                db.run('INSERT INTO accounts (username, password, role, delet, active) VALUES (?, ?, ?, 0, 1)',
                    [account.username, hashedPassword, account.role], (err) => {
                        if (err) console.error('Insert error:', err.message);
                    });
            });
            console.log('Default accounts inserted.');
        }
    });
}

// Endpoint login
app.post('/login', (req, res) => {
    console.log('Login attempt:', req.body);
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username dan password harus diisi!' });
    }
    db.get('SELECT * FROM accounts WHERE username = ? AND delet = 0', [username], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: 'Server error' });
        if (row && bcrypt.compareSync(password, row.password)) {
            console.log('Login success for:', username);
            res.json({ success: true, role: row.role, message: 'Login berhasil!' });
        } else {
            res.json({ success: false, message: 'Username atau password salah.' });
        }
    });
});

// Endpoint register
app.post('/register', (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ success: false, message: 'Semua field harus diisi!' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO accounts (username, password, role, delet, active) VALUES (?, ?, ?, 0, 1)',
        [username, hashedPassword, role], function(err) {
            if (err) {
                console.error('Register error:', err.message);
                return res.status(500).json({ success: false, message: 'Username sudah ada atau error server' });
            }
            res.json({ success: true, message: 'Akun berhasil dibuat!' });
        });
});

// Endpoint list akun
app.get('/accounts', (req, res) => {
    db.all('SELECT username, role, active FROM accounts WHERE delet = 0', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Endpoint detail akun (untuk edit)
app.get('/accounts/:username', (req, res) => {
    const { username } = req.params;
    db.get('SELECT username, role, active FROM accounts WHERE username = ? AND delet = 0', [username], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Akun tidak ditemukan' });
        res.json(row);
    });
});

// Endpoint update akun
app.put('/accounts/:username', (req, res) => {
    const { username } = req.params;
    const { password, role, active } = req.body;
    const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;
    const query = hashedPassword ?
        'UPDATE accounts SET password = ?, role = ?, active = ? WHERE username = ? AND delet = 0' :
        'UPDATE accounts SET role = ?, active = ? WHERE username = ? AND delet = 0';
    const params = hashedPassword ? [hashedPassword, role, active, username] : [role, active, username];
    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Akun berhasil diupdate!' });
    });
});

// Endpoint delete akun
app.delete('/accounts/:username', (req, res) => {
    const { username } = req.params;
    db.run('UPDATE accounts SET delet = 1 WHERE username = ? AND delet = 0', [username], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Akun berhasil dihapus!' });
    });
});

// Endpoint CRUD prestasi
app.get('/prestasi', (req, res) => {
    db.all('SELECT * FROM prestasi', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.get('/prestasi/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM prestasi WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});
app.post('/prestasi', (req, res) => {
    const { title, description } = req.body;
    db.run('INSERT INTO prestasi (title, description) VALUES (?, ?)', [title, description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});
app.put('/prestasi/:id', (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;
    db.run('UPDATE prestasi SET title = ?, description = ? WHERE id = ?', [title, description, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});
app.delete('/prestasi/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM prestasi WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Endpoint CRUD karya (mirip prestasi)
app.get('/karya', (req, res) => {
    db.all('SELECT * FROM karya', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.get('/karya/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM karya WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});
app.post('/karya', (req, res) => {
    const { title, description } = req.body;
    db.run('INSERT INTO karya (title, description) VALUES (?, ?)', [title, description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});
app.put('/karya/:id', (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;
    db.run('UPDATE karya SET title = ?, description = ? WHERE id = ?', [title, description, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});
app.delete('/karya/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM karya WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

process.on('SIGINT', () => {
    db.close((err) => {
        if (err) console.error('DB close error:', err.message);
        process.exit(0);
    });
});
