import express from 'express';
import { createHmac, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { hostname, networkInterfaces } from 'node:os';
import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import { openDatabase, resetDatabase, transaction } from './database.mjs';
import { registerClassExamRoutes } from './class-exams.mjs';
import { overviewReport, sendReport } from './reports.mjs';
import { examDurations, examScore, layouts, lessonsFor, levelFor, makeActivity, replay } from '../shared/training.mjs';

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}
const data = resolve(option('--data') ?? process.env.ATOLYE_DATA ?? 'data');
const db = openDatabase(data);
const query = sql => db.prepare(sql);
const hash = promisify(scrypt);
const now = () => new Date().toISOString();
const layoutLevel = (user, layout) => user['current_level_' + layout.toLowerCase()];
const usernameValue = value => typeof value === 'string' ? value.trim().toLocaleLowerCase('tr') : '';
const validUsername = value => /^[\p{L}\p{N}_.-]{3,40}$/u.test(value);
const validPassword = value => typeof value === 'string' && value.length >= 8 && value.length <= 128;
const clean = (value, limit) => typeof value === 'string' ? value.trim().normalize('NFC').slice(0, limit + 1) : '';
const validName = value => value.length >= 2 && value.length <= 80 && !/[\p{C}]/u.test(value);
const findUser = query('SELECT * FROM users WHERE username = ?');
const getUser = query('SELECT * FROM users WHERE id = ?');
const insertUser = query(`INSERT INTO users(id,username,password_hash,full_name,role,academic_year,class_name,
  preferred_keyboard,created_at,is_teacher,approval_status,registration_ip) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
const setPassword = query('UPDATE users SET password_hash=? WHERE id=?');
const removeUserSessions = query('DELETE FROM auth_sessions WHERE user_id=?');
const removeStudentData = [removeUserSessions, ...[
  'attempts', 'sessions_and_tests', 'character_error_stats', 'class_exam_students'
].map(table => query('DELETE FROM ' + table + ' WHERE user_id=?'))];
const removeStudentAccount = query("DELETE FROM users WHERE id=? AND role='student'");
const hasTeacher = query("SELECT 1 FROM users WHERE role='admin' AND is_teacher=1 LIMIT 1");
const hasSetup = query("SELECT 1 FROM users WHERE role='admin' AND is_teacher=0 LIMIT 1");
const removeSetupSessions = query("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE role='admin' AND is_teacher=0)");
const setupUsername = '@setup';
const secretFallback = randomBytes(16).toString('hex');
async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return salt + ':' + (await hash(password, salt, 64)).toString('hex');
}
const accountRole = user => user.role === 'student' ? 'student' : user.is_teacher ? 'teacher' : 'bootstrap';
const userView = ({ password_hash, is_teacher, approval_status, registration_ip, registration_hostname, ...user }) =>
  ({ ...user, role: accountRole({ ...user, is_teacher }) });

async function configureAdmin() {
  const username = usernameValue(option('--username')) || setupUsername;
  const fullName = clean(option('--name') ?? 'Kurulum yöneticisi', 80);
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 1024) throw new Error('Parola girdisi çok uzun.');
  }
  const password = input.replace(/\r?\n$/, '');
  if ((username !== setupUsername && !validUsername(username)) || !validName(fullName) || !validPassword(password)) {
    throw new Error('Kurulum için standart girdiden en az 8 karakterli geçerli bir parola gerekli.');
  }
  const encoded = await passwordHash(password);
  transaction(db, () => {
    if (hasTeacher.get()) throw new Error('İlk öğretmen hesabı zaten oluşturulmuş. Kurulum parolası bu aşamada değiştirilemez.');
    const stored = findUser.get(username);
    if (stored?.role === 'student') throw new Error('Bu kullanıcı adı öğrenciye ait.');
    if (stored) {
      setPassword.run(encoded, stored.id);
      removeUserSessions.run(stored.id);
    } else insertUser.run(randomUUID(), username, encoded, fullName, 'admin', '', '', 'F', now(), 0, 'approved', null);
  });
  console.log('İlk öğretmen için kurulum parolası hazır.');
  db.close();
}

function start() {
  const port = Number(option('--port') ?? process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port 1 ile 65535 arasında olmalıdır.');
  const host = option('--host') ?? process.env.HOST ?? '0.0.0.0';
  serve(port, host);
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => { throw new ApiError(status, message); };

function validateAcademicYear(value) {
  const academicYear = clean(value, 9);
  if (!/^20\d\d-20\d\d$/.test(academicYear) || Number(academicYear.slice(5)) !== Number(academicYear.slice(0, 4)) + 1) {
    fail(400, 'Öğrenim yılı ardışık iki yıl olmalıdır. Örnek 2026-2027.');
  }
  return academicYear;
}

function enrollment(body) {
  const academicYear = validateAcademicYear(body.academic_year);
  const className = clean(body.class_name, 40).toLocaleUpperCase('tr');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,39}$/u.test(className)) fail(400, 'Geçerli bir sınıf adı girin.');
  return [academicYear, className];
}

function serve(port, host) {
  const app = express();
  const publicDir = join(__dirname, 'public');
  const maxAge = 8 * 60 * 60 * 1000;
  const secure = process.env.ATOLYE_SECURE_COOKIE === '1';
  const cookieSettings = { httpOnly: true, sameSite: 'strict', secure, path: '/' };
  const registrationDns = new Resolver({ timeout: 1500, tries: 1 });
  const setRegistrationHostname = query('UPDATE users SET registration_hostname=? WHERE id=?');

  async function resolveRegistrationHostname(address) {
    if (address === '::1' || address.startsWith('127.')) return hostname();
    const names = await registrationDns.reverse(address).catch(() => []);
    return names.map(name => name.replace(/\.$/, '')).find(name => /^[a-z0-9][a-z0-9.-]{0,252}$/i.test(name));
  }
  query("INSERT OR IGNORE INTO settings(key,value) VALUES('jwt_secret',?)").run(randomBytes(48).toString('hex'));
  let secret = query("SELECT value FROM settings WHERE key='jwt_secret'").get().value;
  const sign = value => createHmac('sha256', secret).update(value).digest('base64url');
  const jwtHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
  const addAuth = query('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)');
  const purgeAuth = query('DELETE FROM auth_sessions WHERE expires_at <= ?');
  const activeAuth = query('SELECT user_id FROM auth_sessions WHERE id=? AND expires_at>?');
  const deleteAuth = query('DELETE FROM auth_sessions WHERE id=?');
  const attemptMaxAge = 24 * 60 * 60 * 1000;
  const addAttempt = query('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)');
  const getAttempt = query('SELECT * FROM attempts WHERE id=? AND user_id=?');
  const purgeAttempts = query('DELETE FROM attempts WHERE started_at < ?');
  const deleteAttempt = query('DELETE FROM attempts WHERE id=?');
  const findResult = query('SELECT * FROM sessions_and_tests WHERE id=? AND user_id=?');
  const hasPlacement = query("SELECT 1 FROM sessions_and_tests WHERE user_id=? AND keyboard_layout=? AND activity_type='placement_test' LIMIT 1");
  const addResult = query('INSERT INTO sessions_and_tests VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const addStat = query(`
    INSERT INTO character_error_stats VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT DO UPDATE SET error_count=error_count+excluded.error_count,total_hits=total_hits+excluded.total_hits
  `);
  const weakByLayout = query(`
    SELECT expected_char, SUM(error_count) AS errors, SUM(total_hits) AS hits
    FROM character_error_stats WHERE user_id=? AND keyboard_layout=? AND expected_char <> ' '
    GROUP BY expected_char HAVING errors>0 ORDER BY CAST(errors AS REAL)/hits DESC, errors DESC, expected_char LIMIT 12
  `);
  const levelUpdates = Object.fromEntries(layouts.map(layout => [
    layout, query('UPDATE users SET current_level_' + layout.toLowerCase() + '=? WHERE id=?')
  ]));

  function giveToken(res, user) {
    const id = randomUUID();
    const expiry = Math.floor((Date.now() + maxAge) / 1000);
    purgeAuth.run(Date.now());
    addAuth.run(id, user.id, expiry * 1000);
    const payload = Buffer.from(JSON.stringify({ sub: user.id, jti: id, exp: expiry })).toString('base64url');
    const unsigned = jwtHeader + '.' + payload;
    res.cookie('atolye', unsigned + '.' + sign(unsigned), { ...cookieSettings, maxAge });
    res.json({ user: userView(user) });
  }

  function readAuth(req) {
    const token = req.headers.cookie?.match(/(?:^|;\s*)atolye=([A-Za-z0-9._-]{50,500})(?:;|$)/)?.[1] ??
      req.headers.authorization?.match(/^Bearer ([A-Za-z0-9._-]{50,500})$/i)?.[1];
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== jwtHeader || parts[2].length !== 43) return null;
    if (!timingSafeEqual(Buffer.from(parts[2]), Buffer.from(sign(parts[0] + '.' + parts[1])))) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.exp * 1000 <= Date.now() || activeAuth.get(payload.jti, Date.now())?.user_id !== payload.sub) return null;
    return payload;
  }

  const limits = new Map();
  function throttle(bucket, key, max, period) {
    const time = Date.now();
    const name = bucket + ':' + key;
    if (limits.size > 10000) {
      for (const [entry, state] of limits) if (state.until <= time) limits.delete(entry);
      if (limits.size > 20000) fail(429, 'Çok fazla istek. Biraz sonra yeniden deneyin.');
    }
    const state = limits.get(name);
    if (!state || state.until <= time) limits.set(name, { count: 1, until: time + period });
    else if (state.count >= max) fail(429, 'Çok fazla deneme. Biraz sonra yeniden deneyin.');
    else state.count++;
  }
  function requireUser(req, _res, next) {
    req.session = readAuth(req);
    req.user = req.session && getUser.get(req.session.sub);
    if (!req.user || (accountRole(req.user) === 'bootstrap' && hasTeacher.get())) fail(401, 'Devam etmek için giriş yapın.');
    if (req.user.approval_status !== 'approved') fail(403, 'Öğrenci hesabınız öğretmen onayı bekliyor.');
    next();
  }
  function requireRole(role) {
    return (req, _res, next) => {
      if (accountRole(req.user) !== role) fail(403, 'Bu işlem için yetkiniz yok.');
      next();
    };
  }
  const student = requireRole('student');
  const admin = requireRole('teacher');
  const findYear = query('SELECT 1 FROM academic_years WHERE year=?');
  const findClass = query('SELECT 1 FROM school_classes WHERE academic_year=? AND class_name=?');
  const listEnrollment = query(`SELECT y.year,c.class_name FROM academic_years y
    LEFT JOIN school_classes c ON c.academic_year=y.year ORDER BY y.year DESC,c.class_name`);
  function requireEnrollment(body) {
    const selection = enrollment(body);
    if (!findClass.get(...selection)) fail(400, 'Öğretmenin tanımladığı bir öğrenim yılı ve sınıf seçin.');
    return selection;
  }

  function localMaintenance(req) {
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    return loopback && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(req.get('Host') ?? '');
  }

  function getLayout(value, user) {
    const layout = value ?? user.preferred_keyboard;
    if (!layouts.includes(layout)) fail(400, 'Türkçe F veya Türkçe Q seçin.');
    return layout;
  }
  const parseResult = row => ({ ...row, errors: JSON.parse(row.errors) });

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; style-src 'self' 'unsafe-inline'"
    });
    next();
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.get('Origin');
      const hostname = req.get('Host');
      if (req.get('Sec-Fetch-Site') === 'cross-site' || (origin && !['http://' + hostname, 'https://' + hostname].includes(origin))) {
        fail(403, 'Bu kaynaktan istek kabul edilmiyor.');
      }
    }
    next();
  });
  app.use('/api', express.json({ limit: '1536kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'tus-atolyesi', port }));
  app.get('/api/enrollment', (_req, res) => {
    const years = new Map();
    for (const row of listEnrollment.all()) {
      if (!years.has(row.year)) years.set(row.year, { year: row.year, classes: [] });
      if (row.class_name) years.get(row.year).classes.push(row.class_name);
    }
    res.json({ years: [...years.values()] });
  });
  app.post('/api/teacher/academic-years', requireUser, admin, (req, res) => {
    const year = validateAcademicYear(req.body?.academic_year);
    const result = query('INSERT OR IGNORE INTO academic_years(year) VALUES(?)').run(year);
    if (!result.changes) fail(409, 'Bu öğrenim yılı zaten tanımlı.');
    res.status(201).json({ year });
  });
  app.post('/api/teacher/classes', requireUser, admin, (req, res) => {
    const [year, className] = enrollment(req.body ?? {});
    if (!findYear.get(year)) fail(400, 'Önce öğrenim yılını oluşturun.');
    const result = query('INSERT OR IGNORE INTO school_classes(academic_year,class_name) VALUES(?,?)').run(year, className);
    if (!result.changes) fail(409, 'Bu sınıf seçilen yılda zaten tanımlı.');
    res.status(201).json({ year, class_name: className });
  });

  app.post('/api/auth/register', async (req, res) => {
    const receivedAt = now();
    const peerAddress = req.socket.remoteAddress?.replace(/^::ffff:(?=\d)/i, '');
    const registrationIp = peerAddress && isIP(peerAddress) ? peerAddress : null;
    throttle('register', req.ip, 80, 15 * 60 * 1000);
    const registrationSecret = secret;
    const body = req.body ?? {};
    const username = usernameValue(body.username);
    const fullName = clean(body.full_name, 80);
    if (!validUsername(username) || !validName(fullName) || !validPassword(body.password)) {
      fail(400, 'Kullanıcı adı, ad soyad ve en az 8 karakterli bir parola girin.');
    }
    const [year, className] = requireEnrollment(body);
    const layout = getLayout(body.preferred_keyboard, { preferred_keyboard: 'F' });
    if (findUser.get(username)) fail(409, 'Bu kullanıcı adı zaten kullanılıyor.');
    const encoded = await passwordHash(body.password);
    if (secret !== registrationSecret) fail(409, 'Veritabanı sıfırlandı. Başvurunuzu yeniden gönderin.');
    const id = randomUUID();
    if (findUser.get(username)) fail(409, 'Bu kullanıcı adı zaten kullanılıyor.');
    insertUser.run(id, username, encoded, fullName, 'student', year, className, layout, receivedAt, 0, 'pending', registrationIp);
    if (registrationIp) void resolveRegistrationHostname(registrationIp).then(name => {
      if (name) setRegistrationHostname.run(name, id);
    }).catch(error => console.error('Başvuru cihaz adı kaydedilemedi:', error.message));
    res.status(201).json({ status: 'pending' });
  });
  async function login(req, res, username, password, message) {
    if (!validPassword(password)) fail(401, message);
    throttle('login-ip', req.ip, 100, 5 * 60 * 1000);
    throttle('login-account', req.ip + ':' + username, 8, 5 * 60 * 1000);
    const user = findUser.get(username);
    const candidate = await passwordHash(password, user?.password_hash.split(':')[0] ?? secretFallback);
    if (!user || !timingSafeEqual(Buffer.from(candidate), Buffer.from(user.password_hash)) || getUser.get(user.id)?.password_hash !== user.password_hash) fail(401, message);
    limits.delete('login-account:' + req.ip + ':' + username);
    if (accountRole(user) === 'bootstrap' && hasTeacher.get()) fail(403, 'Kurulum tamamlandı. Öğretmen hesabınızla giriş yapın.');
    if (user.approval_status !== 'approved') fail(403, 'Öğrenci hesabınız öğretmen onayı bekliyor.');
    giveToken(res, user);
  }
  app.post('/api/auth/login', async (req, res) => {
    const { username: raw, password } = req.body ?? {};
    const username = usernameValue(raw);
    if (!validUsername(username)) fail(401, 'Kullanıcı adı veya parola hatalı.');
    await login(req, res, username, password, 'Kullanıcı adı veya parola hatalı.');
  });
  app.get('/api/auth/setup', (_req, res) => res.json({ initialized: Boolean(hasTeacher.get()), configured: Boolean(findUser.get(setupUsername)) }));
  app.post('/api/auth/setup', async (req, res) => {
    if (hasTeacher.get()) fail(403, 'Kurulum tamamlandı. Öğretmen hesabınızla giriş yapın.');
    await login(req, res, setupUsername, req.body?.password, 'Kurulum parolası hatalı.');
  });
  app.get('/api/auth/database-reset', (req, res) => {
    if (!localMaintenance(req)) return res.json({ local: false });
    res.json({ local: true, configured: Boolean(hasSetup.get()), needsUsername: !findUser.get(setupUsername) });
  });
  app.post('/api/auth/database-reset', async (req, res) => {
    if (!localMaintenance(req)) fail(403, 'Veritabanı yalnızca ana bilgisayardan sıfırlanabilir.');
    const { password, confirmation, username } = req.body ?? {};
    if (confirmation !== 'SIFIRLA') fail(400, 'İşlemi onaylamak için SIFIRLA yazın.');
    if (!validPassword(password)) fail(401, 'Kurulum bilgileri hatalı.');
    throttle('reset-database', 'local', 8, 5 * 60 * 1000);
    const previousSecret = secret;
    const account = findUser.get(setupUsername) ?? findUser.get(usernameValue(username));
    const setup = account && accountRole(account) === 'bootstrap' ? account : null;
    const candidate = await passwordHash(password, setup?.password_hash.split(':')[0] ?? secretFallback);
    if (!setup || !timingSafeEqual(Buffer.from(candidate), Buffer.from(setup.password_hash)) ||
        getUser.get(setup.id)?.password_hash !== setup.password_hash) fail(401, 'Kurulum bilgileri hatalı.');
    if (secret !== previousSecret) fail(409, 'Veritabanı bu sırada sıfırlandı.');
    const freshSecret = randomBytes(48).toString('hex');
    const backup = resetDatabase(db, data, setup.id, setupUsername, freshSecret);
    secret = freshSecret;
    limits.clear();
    res.clearCookie('atolye', cookieSettings).json({ backup });
  });
  app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: userView(req.user) }));
  app.post('/api/auth/logout', (req, res) => {
    const session = readAuth(req);
    if (session) deleteAuth.run(session.jti);
    res.clearCookie('atolye', cookieSettings).json({ ok: true });
  });
  app.get('/api/teacher/accounts', requireUser, admin, (_req, res) => {
    const teachers = query("SELECT id, username, full_name FROM users WHERE role='admin' AND is_teacher=1 ORDER BY full_name, username").all();
    const pending = query(`SELECT id, username, full_name, academic_year, class_name, created_at, registration_ip, registration_hostname
      FROM users WHERE role='student' AND approval_status='pending' ORDER BY created_at, username`).all();
    res.json({ teachers, pending });
  });
  app.post('/api/teacher/accounts', requireUser, async (req, res) => {
    const role = accountRole(req.user);
    if (role !== 'teacher' && role !== 'bootstrap') fail(403, 'Bu işlem için yetkiniz yok.');
    const { username: raw, full_name, password } = req.body ?? {};
    const username = usernameValue(raw);
    const fullName = clean(full_name, 80);
    if (!validUsername(username) || !validName(fullName) || !validPassword(password)) {
      fail(400, 'Öğretmen için kullanıcı adı, ad soyad ve en az 8 karakterli parola girin.');
    }
    throttle('create-teacher', req.user.id, 30, 5 * 60 * 1000);
    const encoded = await passwordHash(password);
    const id = randomUUID();
    transaction(db, () => {
      if (!activeAuth.get(req.session.jti, Date.now())) fail(401, 'Devam etmek için giriş yapın.');
      if (role === 'bootstrap' && hasTeacher.get()) fail(409, 'İlk öğretmen hesabı zaten oluşturuldu.');
      if (findUser.get(username)) fail(409, 'Bu kullanıcı adı zaten kullanılıyor.');
      insertUser.run(id, username, encoded, fullName, 'admin', '', '', 'F', now(), 1, 'approved', null);
      if (role === 'bootstrap') removeSetupSessions.run();
    });
    if (role === 'bootstrap') return giveToken(res.status(201), getUser.get(id));
    res.status(201).json({ teacher: userView(getUser.get(id)) });
  });
  app.post('/api/teacher/accounts/:id/approve', requireUser, admin, (req, res) => {
    const target = getUser.get(req.params.id);
    if (target?.role !== 'student') fail(404, 'Öğrenci hesabı bulunamadı.');
    requireEnrollment(target);
    query("UPDATE users SET approval_status='approved' WHERE id=? AND approval_status='pending'").run(target.id);
    res.json({ status: 'approved' });
  });
  app.delete('/api/teacher/accounts/:id', requireUser, admin, (req, res) => {
    transaction(db, () => {
      const target = getUser.get(req.params.id);
      if (target?.role !== 'student') fail(404, 'Öğrenci hesabı bulunamadı.');
      for (const remove of removeStudentData) remove.run(target.id);
      removeStudentAccount.run(target.id);
    });
    res.json({ ok: true });
  });
  app.patch('/api/profile', requireUser, student, (req, res) => {
    const body = req.body ?? {};
    const [year, className] = requireEnrollment({ ...req.user, ...body });
    const layout = getLayout(body.preferred_keyboard, req.user);
    query('UPDATE users SET academic_year=?,class_name=?,preferred_keyboard=? WHERE id=?').run(year, className, layout, req.user.id);
    res.json({ user: userView(getUser.get(req.user.id)) });
  });

  app.get('/api/lessons', requireUser, student, (req, res) => {
    const layout = getLayout(req.query.layout, req.user);
    const current = layoutLevel(req.user, layout);
    const selection = req.query.level === undefined ? undefined : Number(req.query.level);
    if (selection !== undefined && (!Number.isInteger(selection) || selection < 1 || selection > 5)) fail(400, 'Seviye 1 ile 5 arasında olmalıdır.');
    const completed = new Set(query("SELECT DISTINCT activity_id FROM sessions_and_tests WHERE user_id=? AND keyboard_layout=? AND activity_type='lesson'").all(req.user.id, layout).map(row => row.activity_id));
    const lessons = lessonsFor(layout).filter(item => selection === undefined || item.level === selection)
      .map(({ text, ...item }) => ({ ...item, ...(item.level <= current ? { text } : {}), locked: item.level > current, completed: completed.has(item.id) }));
    res.json({ lessons, level: current });
  });
  app.get('/api/lessons/custom-weakness', requireUser, student, (req, res) => {
    const layout = getLayout(req.query.layout, req.user);
    const weaknesses = weakByLayout.all(req.user.id, layout);
    res.json({ activity: makeActivity('weakness', layout, randomInt, weaknesses), weaknesses });
  });
  app.get('/api/results', requireUser, student, (req, res) => {
    const layout = getLayout(req.query.layout, req.user);
    const id = req.user.id;
    const history = query('SELECT * FROM sessions_and_tests WHERE user_id=? AND keyboard_layout=? ORDER BY created_at DESC, rowid DESC LIMIT 200').all(id, layout).map(parseResult);
    const summary = query('SELECT COUNT(*) AS count, AVG(wpm) AS wpm, AVG(accuracy) AS accuracy, SUM(duration_seconds) AS seconds FROM sessions_and_tests WHERE user_id=? AND keyboard_layout=?').get(id, layout);
    res.json({ history, weaknesses: weakByLayout.all(id, layout), summary, placed: Boolean(hasPlacement.get(id, layout)) });
  });

  app.post('/api/attempts', requireUser, student, (req, res) => {
    throttle('attempt', req.user.id, 40, 5 * 60 * 1000);
    const { activity: activityId, layout: requestedLayout, duration = 60 } = req.body ?? {};
    const layout = getLayout(requestedLayout, req.user);
    if (activityId === 'placement' && !examDurations.includes(duration)) fail(400, 'Sınav süresi 1, 5, 10, 15 veya 20 dakika olmalıdır.');
    const activity = makeActivity(activityId, layout, randomInt, activityId === 'weakness' ? weakByLayout.all(req.user.id, layout) : [], duration);
    if (!activity) fail(404, activityId === 'weakness' ? 'Bu düzen için henüz hata kaydı yok.' : 'Çalışma bulunamadı.');
    if (activity.level > layoutLevel(req.user, layout)) fail(403, 'Bu dersin kilidi henüz açılmadı.');
    const id = randomUUID();
    const start = Date.now();
    purgeAttempts.run(start - attemptMaxAge);
    addAttempt.run(id, req.user.id, layout, req.user.academic_year, req.user.class_name, JSON.stringify(activity), start);
    res.status(201).json({ id, activity });
  });
  registerClassExamRoutes(app, { db, requireUser, admin, student, fail, requireEnrollment, attemptMaxAge, addAttempt, getAttempt });
  app.post('/api/results/submit', requireUser, student, (req, res) => {
    const { id, events, elapsed } = req.body ?? {};
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) fail(400, 'Geçersiz çalışma kimliği.');
    const existing = findResult.get(id, req.user.id);
    if (existing) return res.json({ result: parseResult(existing), user: userView(req.user) });
    const attempt = getAttempt.get(id, req.user.id);
    if (!attempt || Date.now() - attempt.started_at > attemptMaxAge) fail(404, 'Çalışma kaydı bulunamadı veya süresi doldu.');
    if (elapsed > Date.now() - attempt.started_at + 250) fail(400, 'Çalışma süresi geçersiz.');
    const activity = JSON.parse(attempt.activity);
    const outcome = replay(activity, events, elapsed);
    if (!outcome) fail(400, 'Yazım ya da süre kaydı geçersiz. Çalışmayı yeniden başlatın.');
    const result = transaction(db, () => {
      const duplicate = findResult.get(id, req.user.id);
      if (duplicate) return duplicate;
      const layout = attempt.keyboard_layout;
      let level = layoutLevel(getUser.get(req.user.id), layout);
      const { metrics, stats } = outcome;
      if (activity.type === 'placement_test') {
        const earned = levelFor(metrics.wpm, metrics.accuracy);
        level = hasPlacement.get(req.user.id, layout) ? Math.max(level, Math.min(level + 1, earned)) : earned;
        levelUpdates[layout].run(level, req.user.id);
      }
      const errors = stats.filter(stat => stat.error_count).sort((a, b) => b.error_count - a.error_count);
      addResult.run(id, req.user.id, activity.id, activity.type, activity.title, layout, attempt.academic_year, attempt.class_name,
        metrics.wpm, metrics.cpm, metrics.accuracy, metrics.net_characters, metrics.error_count,
        metrics.duration_seconds, level, now(), JSON.stringify(errors));
      for (const stat of stats) {
        addStat.run(req.user.id, layout, attempt.academic_year, attempt.class_name,
          stat.expected_char, stat.pressed_char, stat.error_count, stat.total_hits);
      }
      deleteAttempt.run(id);
      return findResult.get(id, req.user.id);
    });
    res.json({ result: parseResult(result), user: userView(getUser.get(req.user.id)) });
  });

  function readOverview(options) {
    const groups = query(`
      SELECT academic_year AS year,class_name AS class FROM school_classes ORDER BY year DESC,class
    `).all();
    const year = clean(options.year, 9) || groups[0]?.year || '';
    const choices = groups.filter(group => group.year === year);
    const className = clean(options.class, 40) || choices[0]?.class || '';
    const args = [year, className];
    const rows = query(`
      WITH roster AS (
        SELECT id AS user_id, preferred_keyboard AS keyboard_layout FROM users WHERE role='student' AND approval_status='approved' AND academic_year=? AND class_name=?
        UNION SELECT user_id,keyboard_layout FROM sessions_and_tests WHERE academic_year=? AND class_name=?
      )
      SELECT u.id,u.full_name,u.username,r.keyboard_layout,
        CASE r.keyboard_layout WHEN 'F' THEN u.current_level_f ELSE u.current_level_q END AS level,
        AVG(s.wpm) AS wpm, AVG(s.accuracy) AS accuracy, COALESCE(SUM(s.duration_seconds),0) AS seconds,
        COUNT(s.id) AS count,
        latest.wpm AS exam_wpm, latest.accuracy AS exam_accuracy, e.level AS exam_level
      FROM roster r JOIN users u ON u.id=r.user_id LEFT JOIN sessions_and_tests s
        ON s.user_id=u.id AND s.keyboard_layout=r.keyboard_layout AND s.academic_year=? AND s.class_name=?
      LEFT JOIN sessions_and_tests latest ON latest.id=(
        SELECT x.id FROM sessions_and_tests x WHERE x.user_id=u.id AND x.keyboard_layout=r.keyboard_layout
          AND x.academic_year=? AND x.class_name=? AND x.activity_type='class_exam'
        ORDER BY x.created_at DESC,x.rowid DESC LIMIT 1
      )
      LEFT JOIN class_exam_students m ON m.attempt_id=latest.id
      LEFT JOIN class_exams e ON e.id=m.exam_id
      GROUP BY u.id,r.keyboard_layout ORDER BY u.full_name COLLATE NOCASE,u.id,r.keyboard_layout
    `).all(...args, ...args, ...args, ...args).map(({ exam_wpm, exam_accuracy, exam_level, ...row }) =>
      ({ ...row, score: examScore(exam_wpm, exam_accuracy, exam_level) }));
    const summary = query('SELECT AVG(wpm) AS wpm, AVG(accuracy) AS accuracy, COUNT(*) AS count, COALESCE(SUM(duration_seconds),0) AS seconds FROM sessions_and_tests WHERE academic_year=? AND class_name=?').get(...args);
    const errors = query(`
      SELECT expected_char, SUM(error_count) AS errors FROM character_error_stats
      WHERE academic_year=? AND class_name=? GROUP BY expected_char HAVING errors>0 ORDER BY errors DESC,expected_char LIMIT 6
    `).all(...args);
    return { groups, year, class: className, rows, summary, errors };
  }
  app.get('/api/admin/overview', requireUser, admin, (req, res) => res.json(readOverview(req.query)));
  app.get('/api/admin/overview/export', requireUser, admin, async (req, res) => {
    const data = readOverview(req.query);
    if (!data.groups.some(group => group.year === data.year && group.class === data.class)) fail(404, 'Sınıf bulunamadı.');
    await sendReport(res, req.query.format, overviewReport(data), fail);
  });
  app.get('/api/admin/student/:id', requireUser, admin, (req, res) => {
    const user = getUser.get(req.params.id);
    if (!user || user.role !== 'student' || user.approval_status !== 'approved') fail(404, 'Öğrenci bulunamadı.');
    const layout = getLayout(req.query.layout, user);
    const params = [user.id, layout];
    const scope = req.query.year !== undefined && req.query.class !== undefined;
    if (scope) params.push(...enrollment({ academic_year: req.query.year, class_name: req.query.class }));
    const where = 'WHERE user_id=? AND keyboard_layout=?' + (scope ? ' AND academic_year=? AND class_name=?' : '');
    const history = query('SELECT * FROM sessions_and_tests ' + where + ' ORDER BY created_at DESC, rowid DESC').all(...params).map(parseResult);
    const heatmap = query('SELECT expected_char,SUM(error_count) AS errors,SUM(total_hits) AS hits FROM character_error_stats ' + where + ' GROUP BY expected_char ORDER BY errors DESC').all(...params);
    res.json({ user: userView(user), layout, history, heatmap });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'İstek bulunamadı.' }));
  app.use(express.static(publicDir, { index: 'index.html' }));
  app.use((error, _req, res, _next) => {
    const status = error instanceof ApiError ? error.status : error.type === 'entity.too.large' ? 413 : error.status === 400 ? 400 : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: error instanceof ApiError ? error.message :
      status === 400 ? 'İstek içeriği geçersiz.' : status === 413 ? 'İstek içeriği çok büyük.' : 'Sunucuda bir hata oluştu.' });
  });
  const server = app.listen(port, host, () => {
    console.log('Tuş Atölyesi · http://localhost:' + port);
    if (host === '0.0.0.0') {
      for (const interfaces of Object.values(networkInterfaces())) {
        for (const address of interfaces ?? []) if (address.family === 'IPv4' && !address.internal) {
          console.log('Yerel ağ · http://' + address.address + ':' + port);
        }
      }
    }
  });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'Port ' + port + ' zaten kullanımda.' : error.message);
    db.close();
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => db.close()));
}

if (args.includes('--admin')) configureAdmin().catch(error => {
  console.error(error.message);
  db.close();
  process.exitCode = 1;
});
else start();
