const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));  // Ganti body-parser ke built-in Express untuk efisiensi

// Middleware timeout (kurangi untuk menghindari batas Vercel 10 detik)
app.use((req, res, next) => {
    res.setTimeout(8000, () => {
        console.log('Request timeout for:', req.url);
        res.status(504).json({ error: 'Gateway Timeout' });
    });
    next();
});

// Inisialisasi DB dengan async
const db = new sqlite3.Database('./accounts.db', (err) => {
    if (err) {
        console.error('DB error:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite.');
});

// Helper untuk query async (efisien, non-blocking)
const dbGet = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const dbAll = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbRun = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
};

// Buat tabel jika belum ada (async)
const initializeTables = async () => {
    try {
        await dbRun(`CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            delet BOOLEAN DEFAULT 0,
            active BOOLEAN DEFAULT 1
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS prestasi (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS karya (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL
        )`);
        console.log('Tables initialized.');
    } catch (err) {
        console.error('Table init error:', err);
    }
};

// Inisialisasi akun default (async, tanpa duplicate, dengan cache)
let defaultAccountsCached = null;  // Cache untuk efisiensi
const initializeDefaultAccounts = async () => {
    try {
        const row = await dbGet('SELECT COUNT(*) AS count FROM accounts');
        if (row.count === 0) {
            const defaultAccounts = [
                { username: "affan", password: bcrypt.hashSync("affaneka1412", 10), role: "admin" },
                { username: "mod", password: bcrypt.hashSync("mod123", 10), role: "moderator" }
            ];
            for (const account of defaultAccounts) {
                await dbRun('INSERT INTO accounts (username, password, role, delet, active) VALUES (?, ?, ?, 0, 1)',
                    [account.username, account.password, account.role]);
            }
            console.log('Default accounts inserted.');
            defaultAccountsCached = defaultAccounts;  // Cache
        }
    } catch (err) {
        console.error('Init accounts error:', err);
    }
};

// Jalankan inisialisasi
(async () => {
    await initializeTables();
    await initializeDefaultAccounts();
})();

// Endpoint login (async, cepat)
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username dan password harus diisi!' });
    }
    try {
        const row = await dbGet('SELECT * FROM accounts WHERE username = ? AND delet = 0', [username]);
        if (row && bcrypt.compareSync(password, row.password)) {
            res.json({ success: true, role: row.role, message: 'Login berhasil!' });
        } else {
            res.json({ success: false, message: 'Username atau password salah.' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Endpoint register (async)
app.post('/register', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ success: false, message: 'Semua field harus diisi!' });
    }
    try {
        const hashedPassword = bcrypt.hashSync(password, 10);
        await dbRun('INSERT INTO accounts (username, password, role, delet, active) VALUES (?, ?, ?, 0, 1)',
            [username, hashedPassword, role]);
        res.json({ success: true, message: 'Akun berhasil dibuat!' });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, message: 'Username sudah ada atau error server' });
    }
});

// Endpoint list akun (async, dengan cache jika memungkinkan)
app.get('/accounts', async (req, res) => {
    try {
        const rows = await dbAll('SELECT username, role, active FROM accounts WHERE delet = 0');
        res.json(rows);
    } catch (err) {
        console.error('Accounts error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint detail akun (async)
app.get('/accounts/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const row = await dbGet('SELECT username, role, active FROM accounts WHERE username = ? AND delet = 0', [username]);
        if (!row) return res.status(404).json({ error: 'Akun tidak ditemukan' });
        res.json(row);
    } catch (err) {
        console.error('Account detail error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint update akun (async)
app.put('/accounts/:username', async (req, res) => {
    const { username } = req.params;
    const { password, role, active } = req.body;
    try {
        const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;
        const query = hashedPassword ?
            'UPDATE accounts SET password = ?, role = ?, active = ? WHERE username = ? AND delet = 0' :
            'UPDATE accounts SET role = ?, active = ? WHERE username = ? AND delet = 0';
        const params = hashedPassword ? [hashedPassword, role, active, username] : [role, active, username];
        await dbRun(query, params);
        res.json({ success: true, message: 'Akun berhasil diupdate!' });
    } catch (err) {
        console.error('Update account error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint delete akun (async)
app.delete('/accounts/:username', async (req, res) => {
    const { username } = req.params;
    try {
        await dbRun('UPDATE accounts SET delet = 1 WHERE username = ? AND delet = 0', [username]);
        res.json({ success: true, message: 'Akun berhasil dihapus!' });
    } catch (err) {
        console.error('Delete account error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint CRUD prestasi (async)
app.get('/prestasi', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM prestasi');
        res.json(rows);
    } catch (err) {
        console.error('Prestasi error:', err);
        res.status(500).json({ error: err.message });
    }
});
app.get('/prestasi/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const row = await dbGet('SELECT * FROM prestasi WHERE id = ?', [id]);
        res.json(row);
    } catch (err) {
        console.error('Prestasi detail error:', err);
        res.status(500).json({ error: err.message });
    }
});
app.post('/prestasi', async (req, res) => {
    const { title, description } = req.body;
    try {
        const result = await dbRun('INSERT INTO prestasi (title, description) VALUES (?, ?)', [title, description]);
        res.json({ success: true, id: result.id });
    } catch (err) {
        console.error('Add prestasi error:', err);
        res.status(500).json({ error: err.message });
    }
});
app.put('/prestasi/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;
    try {
        await dbRun('UPDATE prestasi SET title = ?, description = ? WHERE id = ?', [title, description, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Update prestasi error:', err);
        res.status(500).json({ error: err.message });
    }
});
app.delete('/prestasi/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await dbRun('DELETE FROM prestasi WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete prestasi error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint CRUD karya (mirip prestasi, async)
app.get('/karya', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM karya');
        res.json(rows);
    } catch (err) {
        console.error('Karya error:', err);
        res.status(500).json({ error: err.message });
    }
});
app.get('/karya/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const row = await dbGet('SELECT * FROM karya WHERE id = ?', [id]);
        res.json(row);
    } catch (err) {
        console.error('Karya detail error:', err);
        res.status(500).json({ error: err.message });
    }
});
app.post('/karya', async (req, res) => {
    const { title, description } = req.body;
    try {
        const result = await dbRun('INSERT INTO karya (title, description) VALUES (?, ?)', [title, description]);
        res.json({ success: true, id: result.id });
    } catch (err) {
        console.error('Add karya error:', err);
        res.status(500).json({ error: err.message });
    }
});
app.put('/karya/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;
    try {
        await dbRun('UPDATE karya SET title = ?, description = ? WHERE id = ?', [title, description, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Update karya error:', err);
        res.status(500).json({ error: err.message });
    }
});
app.delete('/karya/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await dbRun('DELETE FROM karya WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete karya error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = app;  // Untuk Vercel serverless

// Jika run lokal
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

    process.on('SIGINT', () => {
        db.close((err) => {
            if (err) console.error('DB close error:', err.message);
            process.exit(0);
        });
    });
}
