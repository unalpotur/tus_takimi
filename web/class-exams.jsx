import { useState } from 'react';
import { currentYear, examDurations, levels } from '../shared/training.mjs';
import { api, charLabel, dateFormat, format, Icon, Metrics, ReportButtons, Status, useApi } from './ui.jsx';

const labels = { pending: 'Başlamadı', started: 'Başladı', awaiting_submission: 'Teslim bekleniyor', completed: 'Tamamlandı', expired: 'Kayıt süresi doldu' };
const durationLabel = seconds => seconds / 60 + ' dk';
export const canEnterClassExam = exam => exam.can_enter;

function ExamStatus({ text, active }) {
  return <span className={'exam-status' + (active ? ' exam-status-active' : '')}>{text}</span>;
}

export function StudentExams({ open, request }) {
  const exams = request.data?.exams ?? [];
  return <>
    <div className="page-title"><h1>Sınıf sınavlarım</h1><p>Öğretmeninin yayımladığı sınavlar ve sonuçların</p></div>
    <Status request={request}/>
    {request.data && <section className="panel">
      <div className="panel-head"><h2>Sınavlar</h2></div>
      {exams.length ? <ul className="exam-list">{exams.map(exam => <li key={exam.id}>
        <div className="exam-entry">
          <span><strong>{exam.class_name} · Seviye {exam.level}</strong> <ExamStatus active={canEnterClassExam(exam)}
            text={exam.status === 'pending' ? 'Aktif' : labels[exam.status]}/></span>
          <p className="muted small">{durationLabel(exam.duration_seconds)} · {dateFormat(exam.created_at)}</p>
          {exam.status === 'completed' && <p className="exam-result">{format(exam.wpm)} WPM · %{format(exam.accuracy)} doğruluk · {exam.error_count} hata</p>}
          {!canEnterClassExam(exam) && ['started', 'awaiting_submission'].includes(exam.status) &&
            <p className="exam-result">Bu sınava daha önce katıldın.</p>}
        </div>
        {canEnterClassExam(exam) && <button className="button primary" onClick={() => open({
          id: exam.id, title: 'Sınıf sınavı · Seviye ' + exam.level, type: 'class_exam', duration: exam.duration_seconds, status: exam.status
        })}>{exam.status === 'awaiting_submission' ? 'Teslimi tamamla' : exam.status === 'started' ? 'Sınava dön' : 'Sınavı aç'}</button>}
      </li>)}</ul> : <p className="panel-empty">Şu anda sınıfında yayında bir sınav yok.</p>}
    </section>}
  </>;
}

function ExamResults({ id, onBack, onChanged }) {
  const request = useApi('/admin/class-exams/' + id, 5000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const data = request.data;
  const live = data && !data.exam.closed_at;
  async function changePublication() {
    if (live && !window.confirm('Sınav öğrenci listesinden kaldırılır. Sınav ekranı açık olan öğrenciler sonuçlarını teslim edebilir. Yeniden yayına aldığınızda yalnızca daha önce başlamayanlar girebilir.')) return;
    setBusy(true);
    setError(null);
    try {
      await api('/admin/class-exams/' + id + (live ? '/close' : '/resume'), {}, 'POST');
      request.retry();
      onChanged();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  const completed = data?.rows.filter(row => row.status === 'completed') ?? [];
  return <>
    <div className="page-title between exam-page-title">
      <div><button className="button quiet back-button" onClick={onBack}><Icon name="back" size={16}/> Sınavlara dön</button>
        <h1>{data ? data.exam.class_name + ' · Sınav sonuçları' : 'Sınav sonuçları'}</h1>
        {data && <p>{data.exam.academic_year} · Seviye {data.exam.level} · {durationLabel(data.exam.duration_seconds)} · {dateFormat(data.exam.created_at)}</p>}</div>
      {data && <div className="button-group">
        <ExamStatus text={live ? 'Yayında' : 'Yayında değil'} active={live}/>
        <button className={'button' + (live ? '' : ' primary')} onClick={changePublication} disabled={busy}>
          {busy ? 'Güncelleniyor…' : live ? 'Sınavı durdur' : 'Yayına al'}</button>
      </div>}
    </div>
    <Status request={request}/>
    {error && <p className="notice error" role="alert">{error}</p>}
    {data && <>
      <Metrics items={[
        ['Atanan öğrenci', data.rows.length],
        ['Tamamlayan', completed.length],
        ['Ort. net hız', format(completed.length ? completed.reduce((sum, row) => sum + row.wpm, 0) / completed.length : null), 'WPM'],
        ['Ort. doğruluk', completed.length ? '%' + format(completed.reduce((sum, row) => sum + row.accuracy, 0) / completed.length) : '—']
      ]}/>
      <section className="panel">
        <div className="panel-head between report-heading"><h2>Öğrenci sonuçları</h2>
          <ReportButtons path={'/admin/class-exams/' + id + '/export'}/></div>
        {data.rows.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Sınıf sınavı sonuç tablosu"><table>
          <thead><tr><th scope="col">Öğrenci</th><th scope="col">Durum</th><th scope="col">Düzen</th>
            <th scope="col" className="numeric">Net hız</th><th scope="col" className="numeric">Doğruluk</th><th scope="col" className="numeric">Puan / 100</th>
            <th scope="col" className="numeric">Net vuruş</th><th scope="col" className="numeric">Hata</th><th scope="col">Teslim</th></tr></thead>
          <tbody>{data.rows.map(row => <tr key={row.id}>
            <th scope="row">{row.full_name}<small>{row.username}</small></th>
            <td><ExamStatus text={labels[row.status]} active={row.status === 'completed'}/></td>
            <td>{row.keyboard_layout ? 'Türkçe ' + row.keyboard_layout : '—'}</td>
            <td className="numeric">{row.wpm == null ? '—' : format(row.wpm) + ' WPM'}</td>
            <td className="numeric">{row.accuracy == null ? '—' : '%' + format(row.accuracy)}</td>
            <td className="numeric">{row.score ?? '—'}</td>
            <td className="numeric">{row.net_characters ?? '—'}</td>
            <td className="numeric">{row.error_count ? <details className="pair-list exam-errors"><summary>{row.error_count}</summary>
              <ul>{row.errors.map(pair => <li key={JSON.stringify([pair.expected_char, pair.pressed_char])}>
                {charLabel(pair.expected_char)} → {charLabel(pair.pressed_char)} × {pair.error_count}</li>)}</ul></details> : row.error_count ?? '—'}</td>
            <td>{row.created_at ? dateFormat(row.created_at) : '—'}</td>
          </tr>)}</tbody>
        </table></div> : <p className="panel-empty">Bu sınıfta henüz onaylı öğrenci yok.</p>}
      </section>
      <details className="panel exam-text">
        <summary>Ortak sınav metni</summary>
        <p>{data.exam.exam_text}</p>
      </details>
    </>}
  </>;
}

export function AdminExams() {
  const request = useApi('/admin/class-exams', 5000);
  const groups = request.data?.groups ?? [];
  const years = [...new Set([...groups.map(group => group.year), currentYear()])].sort().reverse();
  const [selection, setSelection] = useState({});
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [published, setPublished] = useState(false);
  const year = years.includes(selection.year) ? selection.year : years[0] ?? '';
  const classes = groups.filter(group => group.year === year);
  const classOption = selection.class === 'new' || !classes.length ? 'new' :
    (classes.find(group => group.class === selection.class) ?? classes[0]).class;
  const className = classOption === 'new' ? selection.className?.trim() ?? '' : classOption;
  const memberCount = classes.find(group => group.class === className.toLocaleUpperCase('tr'))?.count ?? 0;
  async function publish(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setPublished(false);
    try {
      const result = await api('/admin/class-exams', { academic_year: year, class_name: className,
        level: Number(form.get('level')), duration: Number(form.get('duration')) }, 'POST');
      request.retry();
      setSelected(result.id);
      setPublished(true);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  if (selected) return <>
    {published && <p className="notice success" role="status">Sınav yayımlandı.</p>}
    <ExamResults id={selected} onBack={() => { setSelected(null); setPublished(false); }}
      onChanged={() => { setPublished(false); request.retry(); }}/>
  </>;
  return <>
    <div className="page-title"><h1>Sınıf sınavları</h1><p>Sınav yayımla ve öğrenci sonuçlarını takip et.</p></div>
    <Status request={request}/>
    {request.data && <>
      <section className="panel">
        <div className="panel-head"><h2>Yeni sınıf sınavı</h2><p className="muted small">Yeni bir sınav yayımlayın. Sınıftaki onaylı öğrenciler aynı metin ve süreyle katılır.</p></div>
        <form className="exam-form" onSubmit={publish}>
          <div className="exam-form-grid">
            <label className="filter">Öğrenim yılı<select value={year} aria-label="Öğrenim yılı"
              onChange={event => setSelection({ year: event.target.value })}>
              {years.map(item => <option key={item}>{item}</option>)}</select></label>
            <label className="filter">Sınıf<select value={classOption} aria-label="Sınıf"
              onChange={event => setSelection({ year, class: event.target.value })}>
              {classes.map(item => <option key={item.class}>{item.class}</option>)}<option value="new">Sınıf adı gir</option></select></label>
            <label className="filter">Seviye<select name="level" aria-label="Seviye" defaultValue="1">
              {levels.map((level, index) => <option value={index + 1} key={level.title}>{index + 1} · {level.title}</option>)}</select></label>
            <label className="filter">Süre<select name="duration" aria-label="Süre" defaultValue="60">
              {examDurations.map(seconds => <option value={seconds} key={seconds}>{seconds / 60} dakika</option>)}</select></label>
            {classOption === 'new' && <label className="filter">Sınıf adı<input value={selection.className ?? ''} placeholder="Örnek 10-A"
              maxLength={40} required onChange={event => setSelection({ year, class: 'new', className: event.target.value })}/></label>}
          </div>
          {error && <p className="notice error" role="alert">{error}</p>}
          <div className="between exam-form-footer">
            <p className="muted small">{memberCount ? memberCount + ' onaylı öğrenci' : 'Öğrenciler onaylandıkça yayındaki sınava katılabilir.'}</p>
            <button className="button primary" disabled={!className || busy}>{busy ? 'Yayımlanıyor…' : 'Sınavı yayımla'}</button>
          </div>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Yayımlanan sınavlar</h2></div>
        {request.data.exams.length ? <ul className="exam-list">{request.data.exams.map(exam => <li key={exam.id}>
          <div className="exam-entry"><span><strong>{exam.class_name} · Seviye {exam.level}</strong> <ExamStatus
            text={exam.closed_at ? 'Yayında değil' : 'Yayında'} active={!exam.closed_at}/></span>
            <p className="muted small">{exam.academic_year} · {durationLabel(exam.duration_seconds)} · {dateFormat(exam.created_at)}</p>
            <p className="exam-result">{exam.completed} / {exam.assigned} tamamladı · {exam.started - exam.completed} başladı</p>
          </div>
          <button className="button" onClick={() => setSelected(exam.id)}>Sonuçları aç</button>
        </li>)}</ul> : <p className="panel-empty">Henüz sınıf sınavı yayımlanmadı.</p>}
      </section>
    </>}
  </>;
}
