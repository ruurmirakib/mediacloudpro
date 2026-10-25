import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

const ROOT_DIR = process.cwd();
const DATA_DIR = path.resolve(ROOT_DIR, 'data');
const USERS_FILE = path.resolve(DATA_DIR, 'users.json');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface StoredAccount {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  masterKey: string;
  createdAt: string;
  plan: string;
  isAdmin?: boolean;
}

function readUsers(): StoredAccount[] {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
    return [];
  }
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Clean out any legacy mock accounts so database starts 100% clean
    const cleaned = parsed.filter(u => u.id !== 'user-root-admin' && u.id !== 'admin-root');
    if (cleaned.length !== parsed.length) {
      writeUsers(cleaned);
    }
    return cleaned;
  } catch (err) {
    return [];
  }
}

function writeUsers(users: StoredAccount[]) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ---------------- API ENDPOINTS ---------------- //

// GET /api/admin/users: Returns all registered accounts and password backups
app.get('/api/admin/users', (req, res) => {
  try {
    const users = readUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to read database' });
  }
});

// GET /api/admin/database/backup: Full database backup export
app.get('/api/admin/database/backup', (req, res) => {
  try {
    const users = readUsers();
    const backupPayload = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      superAdmin: 'ruurmirakib@gmail.com',
      system: 'Mediya Cloud Pro Server Database',
      totalUsers: users.length,
      users: users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        passwordHash: u.passwordHash,
        masterKey: u.masterKey,
        createdAt: u.createdAt,
        plan: u.plan,
        isAdmin: u.isAdmin || false
      }))
    };
    res.json({ success: true, backup: backupPayload });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to generate database backup' });
  }
});

// POST /api/admin/database/restore: Restore users from database backup
app.post('/api/admin/database/restore', (req, res) => {
  try {
    const { users } = req.body;
    if (!Array.isArray(users)) {
      return res.status(400).json({ success: false, message: 'Invalid users array in backup' });
    }
    const current = readUsers();
    const emailMap = new Map<string, StoredAccount>();
    current.forEach(u => emailMap.set(u.email.toLowerCase(), u));
    users.forEach((u: any) => {
      if (u.email && u.passwordHash) {
        emailMap.set(u.email.toLowerCase(), {
          id: u.id || `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: u.name || u.email.split('@')[0],
          email: u.email.toLowerCase(),
          passwordHash: String(u.passwordHash),
          masterKey: u.masterKey || `RMD-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          createdAt: u.createdAt || new Date().toISOString(),
          plan: u.plan || 'unlimited_pro',
          isAdmin: u.isAdmin || false
        });
      }
    });
    const merged = Array.from(emailMap.values());
    writeUsers(merged);
    res.json({ success: true, count: merged.length, message: `Successfully restored ${merged.length} accounts to database!` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to restore database' });
  }
});


// POST /api/users/register: Called whenever ANY user creates an account on the website
app.post('/api/users/register', (req, res) => {
  try {
    const { name, email, password, masterKey } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const users = readUsers();
    const normalizedEmail = String(email).trim().toLowerCase();

    if (users.some(u => u.email.toLowerCase() === normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Account already exists for this email. Please log in.' });
    }

    const newUser: StoredAccount = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: name ? String(name).trim() : normalizedEmail.split('@')[0],
      email: normalizedEmail,
      passwordHash: String(password), // Saved in the Admin Password Backup Vault
      masterKey: masterKey || `RMD-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      plan: 'unlimited_pro'
    };

    users.push(newUser);
    writeUsers(users);

    console.log(`[Mediya Cloud Pro Vault] New account registered & saved to Admin Portal: ${newUser.email}`);

    res.json({
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        masterKey: newUser.masterKey,
        createdAt: newUser.createdAt,
        plan: newUser.plan
      },
      masterKey: newUser.masterKey
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server registration error' });
  }
});

// POST /api/users/login
app.post('/api/users/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const users = readUsers();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const found = users.find(u => u.email.toLowerCase() === normalizedEmail);
    if (!found) {
      return res.status(404).json({ success: false, message: `No account found for "${email}". Please click "Create Account".` });
    }

    if (found.passwordHash !== password) {
      return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }

    res.json({
      success: true,
      user: {
        id: found.id,
        name: found.name,
        email: found.email,
        masterKey: found.masterKey,
        createdAt: found.createdAt,
        plan: found.plan
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server login error' });
  }
});

// PUT /api/admin/users/:id/password
app.put('/api/admin/users/:id/password', (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    const users = readUsers();
    const target = users.find(u => u.id === id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found in vault' });
    }
    target.passwordHash = String(newPassword);
    writeUsers(users);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update password' });
  }
});

// DELETE /api/admin/users/:id
app.delete('/api/admin/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    let users = readUsers();
    users = users.filter(u => u.id !== id);
    writeUsers(users);
    res.json({ success: true, message: 'User removed from vault' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

// Start Server with Vite middlewares in Dev
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_DIR));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(DIST_DIR, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Mediya Cloud Pro Engine] Server active on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Mediya Cloud Pro Engine] Failed to start server:', err);
});
