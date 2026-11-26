import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function openDatabase(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'atolye.sqlite'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','admin')),
      is_teacher INTEGER NOT NULL DEFAULT 0 CHECK(is_teacher IN (0,1)),
      approval_status TEXT NOT NULL DEFAULT 'approved' CHECK(approval_status IN ('pending','approved')),
      academic_year TEXT NOT NULL, class_name TEXT NOT NULL,
      preferred_keyboard TEXT NOT NULL CHECK(preferred_keyboard IN ('F','Q')),
      current_level_f INTEGER NOT NULL DEFAULT 1 CHECK(current_level_f BETWEEN 1 AND 5),
      current_level_q INTEGER NOT NULL DEFAULT 1 CHECK(current_level_q BETWEEN 1 AND 5),
      created_at TEXT NOT NULL,
      registration_ip TEXT, registration_hostname TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      keyboard_layout TEXT NOT NULL, academic_year TEXT NOT NULL, class_name TEXT NOT NULL,
      activity TEXT NOT NULL, started_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions_and_tests (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      activity_id TEXT NOT NULL, activity_type TEXT NOT NULL, title TEXT NOT NULL,
      keyboard_layout TEXT NOT NULL, academic_year TEXT NOT NULL, class_name TEXT NOT NULL,
      wpm REAL NOT NULL, cpm REAL NOT NULL, accuracy REAL NOT NULL,
      net_characters INTEGER NOT NULL, error_count INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL, resulting_level INTEGER NOT NULL,
      created_at TEXT NOT NULL, errors TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS character_error_stats (
      user_id TEXT NOT NULL REFERENCES users(id), keyboard_layout TEXT NOT NULL,
      academic_year TEXT NOT NULL, class_name TEXT NOT NULL,
      expected_char TEXT NOT NULL, pressed_char TEXT NOT NULL,
      error_count INTEGER NOT NULL, total_hits INTEGER NOT NULL,
      PRIMARY KEY(user_id, keyboard_layout, academic_year, class_name, expected_char, pressed_char)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS class_exams (
      id TEXT PRIMARY KEY, academic_year TEXT NOT NULL, class_name TEXT NOT NULL,
      level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 5), duration_seconds INTEGER NOT NULL,
      exam_text TEXT NOT NULL, created_at TEXT NOT NULL, closed_at TEXT,
      publication INTEGER NOT NULL DEFAULT 1
    ) STRICT;
    CREATE TABLE IF NOT EXISTS class_exam_students (
      exam_id TEXT NOT NULL REFERENCES class_exams(id), user_id TEXT NOT NULL REFERENCES users(id),
      attempt_id TEXT UNIQUE, started_at INTEGER, publication INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(exam_id,user_id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS class_exam_student_lookup ON class_exam_students(user_id,exam_id);
    CREATE INDEX IF NOT EXISTS results_by_student ON sessions_and_tests(user_id, keyboard_layout, created_at);
    CREATE INDEX IF NOT EXISTS results_by_class ON sessions_and_tests(academic_year, class_name, user_id);
    CREATE INDEX IF NOT EXISTS attempts_by_age ON attempts(started_at);
    CREATE INDEX IF NOT EXISTS auth_by_expiry ON auth_sessions(expires_at);
  `);
  // Older databases already contain active student accounts and admin setup credentials.
  if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name='approval_status'").get()) {
    transaction(db, () => {
      if (db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name='approval_status'").get()) return;
      db.exec(`
        ALTER TABLE users ADD COLUMN is_teacher INTEGER NOT NULL DEFAULT 0 CHECK(is_teacher IN (0,1));
        ALTER TABLE users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved' CHECK(approval_status IN ('pending','approved'));
      `);
    });
  }
  const examPublication = db.prepare("SELECT 1 FROM pragma_table_info('class_exams') WHERE name='publication'");
  if (!examPublication.get()) transaction(db, () => {
    if (examPublication.get()) return;
    db.exec(`
      ALTER TABLE class_exams ADD COLUMN publication INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE class_exam_students ADD COLUMN publication INTEGER NOT NULL DEFAULT 1;
    `);
  });
  const registrationMetadata = db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name='registration_ip'");
  if (!registrationMetadata.get()) transaction(db, () => {
    if (registrationMetadata.get()) return;
    db.exec(`
      ALTER TABLE users ADD COLUMN registration_ip TEXT;
      ALTER TABLE users ADD COLUMN registration_hostname TEXT;
    `);
  });
  return db;
}

export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function resetDatabase(db, directory, setupUserId, setupUsername, secret) {
  const backupDir = join(directory, 'yedekler');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = 'atolye-' + stamp + '-' + randomUUID().slice(0, 8) + '.sqlite';
  mkdirSync(backupDir, { recursive: true });
  // Back up the main database and committed WAL changes before deleting any rows.
  db.prepare('VACUUM INTO ?').run(join(backupDir, filename));

  transaction(db, () => {
    db.exec(`
      DELETE FROM auth_sessions;
      DELETE FROM attempts;
      DELETE FROM sessions_and_tests;
      DELETE FROM character_error_stats;
      DELETE FROM class_exam_students;
      DELETE FROM class_exams;
      DELETE FROM settings;
    `);
    db.prepare('DELETE FROM users WHERE id<>?').run(setupUserId);
    db.prepare('UPDATE users SET username=? WHERE id=?').run(setupUsername, setupUserId);
    db.prepare("INSERT INTO settings(key,value) VALUES('jwt_secret',?)").run(secret);
  });
  return 'yedekler/' + filename;
}
