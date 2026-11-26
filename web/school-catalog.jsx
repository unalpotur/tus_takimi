import { useState } from 'react';
import { api, Status, useApi } from './ui.jsx';

function CatalogForm({ years, addClass = false, reload }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const inputs = Object.fromEntries(new FormData(form));
    setBusy(true);
    setFeedback(null);
    try {
      const created = await api(addClass ? '/teacher/classes' : '/teacher/academic-years', inputs, 'POST');
      form.reset();
      setFeedback({ text: addClass ? created.class_name + ' sınıfı eklendi.' : created.year + ' öğrenim yılı eklendi.' });
      reload();
    } catch (error) { setFeedback({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  return <form className="panel form" onSubmit={submit}>
    <h2>{addClass ? 'Yeni sınıf' : 'Yeni öğrenim yılı'}</h2>
    {addClass ? <>
      <label>Öğrenim yılı<select name="academic_year" aria-label="Sınıfın öğrenim yılı" required disabled={!years.length}>
        {!years.length && <option value="">Önce öğrenim yılı oluşturun</option>}
        {years.map(item => <option key={item.year}>{item.year}</option>)}
      </select></label>
      <label>Sınıf adı<input name="class_name" placeholder="Örnek 9-A" maxLength={40} required/></label>
    </> : <label>Öğrenim yılı<input name="academic_year" placeholder="Örnek 2026-2027" maxLength={9}
      pattern="20[0-9]{2}-20[0-9]{2}" required/></label>}
    {feedback && <p className={'notice ' + (feedback.error ? 'error' : 'success')} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    <button className="button primary" disabled={busy || (addClass && !years.length)}>
      {busy ? 'Kaydediliyor…' : addClass ? 'Sınıfı oluştur' : 'Yılı oluştur'}</button>
  </form>;
}

export function SchoolCatalog() {
  const request = useApi('/enrollment');
  const years = request.data?.years ?? [];
  return <>
    <div className="page-title"><h1>Yıl ve sınıflar</h1><p>Öğrencilerin kayıt sırasında seçebileceği öğrenim yıllarını ve sınıfları oluşturun.</p></div>
    <Status request={request}/>
    <div className="teacher-account-grid">
      <CatalogForm years={years} reload={request.retry}/>
      <CatalogForm years={years} addClass reload={request.retry}/>
    </div>
    {request.data && <section className="panel">
      <div className="panel-head"><h2>Tanımlı yıllar ve sınıflar</h2></div>
      {years.length ? <ul className="teacher-account-list">{years.map(item => <li key={item.year}>
        <strong>{item.year}</strong>
        <span className="small muted">{item.classes.length ? item.classes.join(' · ') : 'Henüz sınıf yok.'}</span>
      </li>)}</ul> : <p className="panel-empty">Henüz öğrenim yılı oluşturulmadı.</p>}
    </section>}
  </>;
}
