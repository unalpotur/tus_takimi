import { randomUUID } from 'node:crypto';
import { examDurations, examScore, layouts, makeClassExamText } from '../shared/training.mjs';
import { transaction } from './database.mjs';
import { examReport, sendReport } from './reports.mjs';

export function registerClassExamRoutes(app, { db, requireUser, admin, student, fail, requireEnrollment, attemptMaxAge, addAttempt, getAttempt }) {
  const groups = db.prepare(`
    SELECT c.academic_year AS year,c.class_name AS class,COUNT(u.id) AS count
    FROM school_classes c LEFT JOIN users u ON u.academic_year=c.academic_year AND u.class_name=c.class_name
      AND u.role='student' AND u.approval_status='approved'
    GROUP BY c.academic_year,c.class_name ORDER BY year DESC,class
  `);
  const eligible = db.prepare("SELECT 1 FROM users WHERE id=? AND role='student' AND approval_status='approved' AND academic_year=? AND class_name=?");
  const insertExam = db.prepare(`
    INSERT INTO class_exams(id,academic_year,class_name,level,duration_seconds,exam_text,created_at)
    VALUES(?,?,?,?,?,?,?)
  `);
  const examById = db.prepare('SELECT * FROM class_exams WHERE id=?');
  const studentByExam = db.prepare('SELECT * FROM class_exam_students WHERE exam_id=? AND user_id=?');
  const startExam = db.prepare(`
    INSERT INTO class_exam_students(exam_id,user_id,attempt_id,started_at,publication) VALUES(?,?,?,?,?)
    ON CONFLICT(exam_id,user_id) DO UPDATE SET attempt_id=excluded.attempt_id,
      started_at=excluded.started_at,publication=excluded.publication
  `);
  const closeExam = db.prepare('UPDATE class_exams SET closed_at=? WHERE id=? AND closed_at IS NULL');
  const resumeExam = db.prepare('UPDATE class_exams SET closed_at=NULL,publication=publication+1 WHERE id=? AND closed_at IS NOT NULL');
  // Current class membership supplies new participants; started attempts remain part of their original exam.
  const participants = `WITH participants AS (
    SELECT e.id AS exam_id,u.id AS user_id FROM class_exams e
    JOIN users u ON u.academic_year=e.academic_year AND u.class_name=e.class_name
      AND u.role='student' AND u.approval_status='approved'
    UNION SELECT exam_id,user_id FROM class_exam_students WHERE started_at IS NOT NULL
  )`;
  const results = db.prepare(`
    ${participants}
    SELECT u.id,u.username,u.full_name,m.started_at,s.id AS result_id,s.wpm,s.cpm,s.accuracy,
      s.keyboard_layout,s.error_count,s.net_characters,s.duration_seconds,s.created_at,s.errors
    FROM participants p JOIN users u ON u.id=p.user_id
    LEFT JOIN class_exam_students m ON m.exam_id=p.exam_id AND m.user_id=p.user_id
    LEFT JOIN sessions_and_tests s ON s.id=m.attempt_id
    WHERE p.exam_id=? ORDER BY u.full_name COLLATE NOCASE,u.id
  `);
  const studentExams = db.prepare(`
    SELECT e.id,e.academic_year,e.class_name,e.level,e.duration_seconds,e.created_at,e.closed_at,
      e.publication AS exam_publication,m.publication AS attempt_publication,
      m.started_at,s.id AS result_id,s.keyboard_layout,s.wpm,s.accuracy,s.error_count,s.net_characters,s.created_at AS completed_at
    FROM class_exams e LEFT JOIN class_exam_students m ON m.exam_id=e.id AND m.user_id=?
    LEFT JOIN sessions_and_tests s ON s.id=m.attempt_id
    WHERE (e.academic_year=? AND e.class_name=?) OR m.started_at IS NOT NULL
    ORDER BY (e.closed_at IS NOT NULL), e.created_at DESC, e.rowid DESC
  `);
  const allExams = db.prepare(`
    ${participants}
    SELECT e.id,e.academic_year,e.class_name,e.level,e.duration_seconds,e.created_at,e.closed_at,
      COUNT(p.user_id) AS assigned, COUNT(m.started_at) AS started, COUNT(s.id) AS completed
    FROM class_exams e LEFT JOIN participants p ON p.exam_id=e.id
    LEFT JOIN class_exam_students m ON m.exam_id=p.exam_id AND m.user_id=p.user_id
    LEFT JOIN sessions_and_tests s ON s.id=m.attempt_id
    GROUP BY e.id ORDER BY (e.closed_at IS NOT NULL), e.created_at DESC, e.rowid DESC
  `);

  function status(row, duration) {
    if (row.result_id) return 'completed';
    if (row.started_at == null) return 'pending';
    const elapsed = Date.now() - row.started_at;
    if (elapsed > attemptMaxAge) return 'expired';
    return elapsed >= duration * 1000 ? 'awaiting_submission' : 'started';
  }

  app.get('/api/admin/class-exams', requireUser, admin, (_req, res) =>
    res.json({ groups: groups.all(), exams: allExams.all() }));

  app.post('/api/admin/class-exams', requireUser, admin, (req, res) => {
    const body = req.body ?? {};
    const { level, duration } = body;
    const [year, className] = requireEnrollment(body);
    if (!Number.isInteger(level) || level < 1 || level > 5) fail(400, 'Sınav seviyesi 1 ile 5 arasında olmalıdır.');
    if (!examDurations.includes(duration)) fail(400, 'Geçerli bir sınav süresi seçin.');
    const id = randomUUID();
    insertExam.run(id, year, className, level, duration, makeClassExamText(level, duration), new Date().toISOString());
    res.status(201).json({ id });
  });

  function readResults(id) {
    const exam = examById.get(id);
    if (!exam) fail(404, 'Sınıf sınavı bulunamadı.');
    const rows = results.all(exam.id).map(({ errors, ...row }) => ({
      ...row, status: status(row, exam.duration_seconds), score: examScore(row.wpm, row.accuracy, exam.level),
      errors: errors ? JSON.parse(errors) : []
    }));
    return { exam, rows };
  }
  app.get('/api/admin/class-exams/:id', requireUser, admin, (req, res) => res.json(readResults(req.params.id)));
  app.get('/api/admin/class-exams/:id/export', requireUser, admin, async (req, res) => {
    const data = readResults(req.params.id);
    await sendReport(res, req.query.format, examReport(data), fail);
  });

  app.post('/api/admin/class-exams/:id/close', requireUser, admin, (req, res) => {
    if (!examById.get(req.params.id)) fail(404, 'Sınıf sınavı bulunamadı.');
    closeExam.run(new Date().toISOString(), req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/admin/class-exams/:id/resume', requireUser, admin, (req, res) => {
    if (!examById.get(req.params.id)) fail(404, 'Sınıf sınavı bulunamadı.');
    resumeExam.run(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/class-exams', requireUser, student, (req, res) => {
    const exams = studentExams.all(req.user.id, req.user.academic_year, req.user.class_name)
      .filter(row => !row.closed_at || row.result_id)
      .map(({ exam_publication, attempt_publication, ...row }) => {
        const state = status(row, row.duration_seconds);
        const canEnter = !row.closed_at && (state === 'pending' ||
          (attempt_publication === exam_publication && (state === 'started' || state === 'awaiting_submission')));
        return { ...row, status: state, can_enter: canEnter };
      });
    res.json({ exams });
  });

  app.post('/api/class-exams/:id/start', requireUser, student, (req, res) => {
    const response = transaction(db, () => {
      const exam = examById.get(req.params.id);
      const member = studentByExam.get(req.params.id, req.user.id);
      if (!exam || (!member?.attempt_id && !eligible.get(req.user.id, exam.academic_year, exam.class_name))) {
        fail(404, 'Bu sınıf sınavı hesabınıza atanmadı.');
      }
      if (exam.closed_at) fail(409, 'Öğretmen bu sınavı yayından kaldırdı.');
      if (member?.attempt_id) {
        if (member.publication !== exam.publication) fail(409, 'Bu sınava daha önce katıldınız.');
        const attempt = getAttempt.get(member.attempt_id, req.user.id);
        if (!attempt) fail(409, 'Bu sınav tamamlandı veya sonuç gönderme süresi doldu.');
        const elapsed = Date.now() - attempt.started_at;
        if (elapsed > attemptMaxAge) fail(409, 'Bu sınavın sonuç gönderme süresi doldu.');
        return { id: attempt.id, activity: JSON.parse(attempt.activity), layout: attempt.keyboard_layout,
          elapsed: Math.min(exam.duration_seconds * 1000, Math.max(0, elapsed)) };
      }
      const layout = req.body?.layout ?? req.user.preferred_keyboard;
      if (!layouts.includes(layout)) fail(400, 'Türkçe F veya Türkçe Q seçin.');
      const id = randomUUID();
      const time = Date.now();
      const activity = { id: exam.id, title: 'Sınıf sınavı · Seviye ' + exam.level,
        type: 'class_exam', level: exam.level, duration: exam.duration_seconds, text: exam.exam_text };
      addAttempt.run(id, req.user.id, layout, exam.academic_year, exam.class_name, JSON.stringify(activity), time);
      startExam.run(exam.id, req.user.id, id, time, exam.publication);
      return { id, activity, elapsed: 0, layout };
    });
    res.json(response);
  });
}
