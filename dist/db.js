import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, STORE_DIR } from './config.js';
let db;
function createSchema(database) {
    database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT PRIMARY KEY,
      session_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      trigger_pattern TEXT NOT NULL,
      added_at TEXT NOT NULL,
      container_config TEXT,
      requires_trigger INTEGER DEFAULT 1
    );
  `);
    // Add context_mode column if it doesn't exist (migration for existing DBs)
    try {
        database.exec(`ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`);
    }
    catch {
        /* column already exists */
    }
}
export function initDatabase() {
    const dbPath = path.join(STORE_DIR, 'messages.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    createSchema(db);
    // Migrate from JSON files if they exist
    migrateJsonState();
}
/** @internal - for tests only. Creates a fresh in-memory database. */
export function _initTestDatabase() {
    db = new Database(':memory:');
    createSchema(db);
}
/**
 * Store chat metadata only (no message content).
 * Used for all chats to enable group discovery without storing sensitive content.
 */
export function storeChatMetadata(chatJid, timestamp, name) {
    if (name) {
        // Update with name, preserving existing timestamp if newer
        db.prepare(`
      INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = excluded.name,
        last_message_time = MAX(last_message_time, excluded.last_message_time)
    `).run(chatJid, name, timestamp);
    }
    else {
        // Update timestamp only, preserve existing name if any
        db.prepare(`
      INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        last_message_time = MAX(last_message_time, excluded.last_message_time)
    `).run(chatJid, chatJid, timestamp);
    }
}
/**
 * Update chat name without changing timestamp for existing chats.
 * New chats get the current time as their initial timestamp.
 * Used during group metadata sync.
 */
export function updateChatName(chatJid, name) {
    db.prepare(`
    INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name
  `).run(chatJid, name, new Date().toISOString());
}
/**
 * Get all known chats, ordered by most recent activity.
 */
export function getAllChats() {
    return db
        .prepare(`
    SELECT jid, name, last_message_time
    FROM chats
    ORDER BY last_message_time DESC
  `)
        .all();
}
/**
 * Get timestamp of last group metadata sync.
 */
export function getLastGroupSync() {
    // Store sync time in a special chat entry
    const row = db
        .prepare(`SELECT last_message_time FROM chats WHERE jid = '__group_sync__'`)
        .get();
    return row?.last_message_time || null;
}
/**
 * Record that group metadata was synced.
 */
export function setLastGroupSync() {
    const now = new Date().toISOString();
    db.prepare(`INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES ('__group_sync__', '__group_sync__', ?)`).run(now);
}
/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 */
export function storeMessage(msg) {
    db.prepare(`INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(msg.id, msg.chat_jid, msg.sender, msg.sender_name, msg.content, msg.timestamp, msg.is_from_me ? 1 : 0);
}
/**
 * Store a message directly (for non-WhatsApp channels that don't use Baileys proto).
 */
export function storeMessageDirect(msg) {
    db.prepare(`INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(msg.id, msg.chat_jid, msg.sender, msg.sender_name, msg.content, msg.timestamp, msg.is_from_me ? 1 : 0);
}
export function getNewMessages(jids, lastTimestamp, botPrefix) {
    if (jids.length === 0)
        return { messages: [], newTimestamp: lastTimestamp };
    const placeholders = jids.map(() => '?').join(',');
    // Filter out bot's own messages by checking content prefix (not is_from_me, since user shares the account)
    const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp
    FROM messages
    WHERE timestamp > ? AND chat_jid IN (${placeholders}) AND content NOT LIKE ?
    ORDER BY timestamp
  `;
    const rows = db
        .prepare(sql)
        .all(lastTimestamp, ...jids, `${botPrefix}:%`);
    let newTimestamp = lastTimestamp;
    for (const row of rows) {
        if (row.timestamp > newTimestamp)
            newTimestamp = row.timestamp;
    }
    return { messages: rows, newTimestamp };
}
export function getMessagesSince(chatJid, sinceTimestamp, botPrefix) {
    // Filter out bot's own messages by checking content prefix
    const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp
    FROM messages
    WHERE chat_jid = ? AND timestamp > ? AND content NOT LIKE ?
    ORDER BY timestamp
  `;
    return db
        .prepare(sql)
        .all(chatJid, sinceTimestamp, `${botPrefix}:%`);
}
export function createTask(task) {
    db.prepare(`
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(task.id, task.group_folder, task.chat_jid, task.prompt, task.schedule_type, task.schedule_value, task.context_mode || 'isolated', task.next_run, task.status, task.created_at);
}
export function getTaskById(id) {
    return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id);
}
export function getTasksForGroup(groupFolder) {
    return db
        .prepare('SELECT * FROM scheduled_tasks WHERE group_folder = ? ORDER BY created_at DESC')
        .all(groupFolder);
}
export function getAllTasks() {
    return db
        .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
        .all();
}
export function updateTask(id, updates) {
    const fields = [];
    const values = [];
    if (updates.prompt !== undefined) {
        fields.push('prompt = ?');
        values.push(updates.prompt);
    }
    if (updates.schedule_type !== undefined) {
        fields.push('schedule_type = ?');
        values.push(updates.schedule_type);
    }
    if (updates.schedule_value !== undefined) {
        fields.push('schedule_value = ?');
        values.push(updates.schedule_value);
    }
    if (updates.next_run !== undefined) {
        fields.push('next_run = ?');
        values.push(updates.next_run);
    }
    if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
    }
    if (fields.length === 0)
        return;
    values.push(id);
    db.prepare(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}
export function deleteTask(id) {
    // Delete child records first (FK constraint)
    db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}
export function getDueTasks() {
    const now = new Date().toISOString();
    return db
        .prepare(`
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `)
        .all(now);
}
export function updateTaskAfterRun(id, nextRun, lastResult) {
    const now = new Date().toISOString();
    db.prepare(`
    UPDATE scheduled_tasks
    SET next_run = ?, last_run = ?, last_result = ?, status = CASE WHEN ? IS NULL THEN 'completed' ELSE status END
    WHERE id = ?
  `).run(nextRun, now, lastResult, nextRun, id);
}
export function logTaskRun(log) {
    db.prepare(`
    INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(log.task_id, log.run_at, log.duration_ms, log.status, log.result, log.error);
}
// --- Router state accessors ---
export function getRouterState(key) {
    const row = db
        .prepare('SELECT value FROM router_state WHERE key = ?')
        .get(key);
    return row?.value;
}
export function setRouterState(key, value) {
    db.prepare('INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)').run(key, value);
}
// --- Session accessors ---
export function getSession(groupFolder) {
    const row = db
        .prepare('SELECT session_id FROM sessions WHERE group_folder = ?')
        .get(groupFolder);
    return row?.session_id;
}
export function setSession(groupFolder, sessionId) {
    db.prepare('INSERT OR REPLACE INTO sessions (group_folder, session_id) VALUES (?, ?)').run(groupFolder, sessionId);
}
export function getAllSessions() {
    const rows = db
        .prepare('SELECT group_folder, session_id FROM sessions')
        .all();
    const result = {};
    for (const row of rows) {
        result[row.group_folder] = row.session_id;
    }
    return result;
}
// --- Registered group accessors ---
export function getRegisteredGroup(jid) {
    const row = db
        .prepare('SELECT * FROM registered_groups WHERE jid = ?')
        .get(jid);
    if (!row)
        return undefined;
    return {
        jid: row.jid,
        name: row.name,
        folder: row.folder,
        trigger: row.trigger_pattern,
        added_at: row.added_at,
        containerConfig: row.container_config
            ? JSON.parse(row.container_config)
            : undefined,
        requiresTrigger: row.requires_trigger === null ? undefined : row.requires_trigger === 1,
    };
}
export function setRegisteredGroup(jid, group) {
    db.prepare(`INSERT OR REPLACE INTO registered_groups (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger)
     VALUES (?, ?, ?, ?, ?, ?, ?)`).run(jid, group.name, group.folder, group.trigger, group.added_at, group.containerConfig ? JSON.stringify(group.containerConfig) : null, group.requiresTrigger === undefined ? 1 : group.requiresTrigger ? 1 : 0);
}
export function getAllRegisteredGroups() {
    const rows = db
        .prepare('SELECT * FROM registered_groups')
        .all();
    const result = {};
    for (const row of rows) {
        result[row.jid] = {
            name: row.name,
            folder: row.folder,
            trigger: row.trigger_pattern,
            added_at: row.added_at,
            containerConfig: row.container_config
                ? JSON.parse(row.container_config)
                : undefined,
            requiresTrigger: row.requires_trigger === null ? undefined : row.requires_trigger === 1,
        };
    }
    return result;
}
// --- JSON migration ---
function migrateJsonState() {
    const migrateFile = (filename) => {
        const filePath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(filePath))
            return null;
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            fs.renameSync(filePath, `${filePath}.migrated`);
            return data;
        }
        catch {
            return null;
        }
    };
    // Migrate router_state.json
    const routerState = migrateFile('router_state.json');
    if (routerState) {
        if (routerState.last_timestamp) {
            setRouterState('last_timestamp', routerState.last_timestamp);
        }
        if (routerState.last_agent_timestamp) {
            setRouterState('last_agent_timestamp', JSON.stringify(routerState.last_agent_timestamp));
        }
    }
    // Migrate sessions.json
    const sessions = migrateFile('sessions.json');
    if (sessions) {
        for (const [folder, sessionId] of Object.entries(sessions)) {
            setSession(folder, sessionId);
        }
    }
    // Migrate registered_groups.json
    const groups = migrateFile('registered_groups.json');
    if (groups) {
        for (const [jid, group] of Object.entries(groups)) {
            setRegisteredGroup(jid, group);
        }
    }
}
//# sourceMappingURL=db.js.map