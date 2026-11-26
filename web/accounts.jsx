import { useState } from 'react';
import { api, Icon, Status, useApi } from './ui.jsx';

const registrationDate = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'medium' });

export function SetupAccess({ onUser, onBack }) {
  const request = useApi('/auth/setup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    setBusy(true);
    setError(null);
    try { onUser((await api('/auth/setup', { password }, 'POST')).user); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  return <div className="account-area">
    <div className="page-title"><h1>İlk öğretmeni oluştur</h1><p>Başlamak için Windows kurulumunda belirlenen parolayı girin.</p></div>
    <Status request={request}/>
    {request.data && (request.data.initialized ? <p className="notice">İlk öğretmen hesabı oluşturuldu. Öğretmen hesabınızla oturum açabilirsiniz.</p> :
      request.data.configured ? <form className="panel form" onSubmit={submit}>
        <label>Kurulum parolası<input name="password" type="password" autoComplete="current-password" minLength={8} maxLength={128} required/></label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="button primary" disabled={busy}>{busy ? 'Kontrol ediliyor…' : 'Devam et'}</button>
      </form> : <p className="notice">Kurulum parolasını belirlemek için kurulum paketini yeniden çalıştırın. Eski kurulum hesabınız varsa onunla oturum da açabilirsiniz.</p>)}
    <button className="button quiet back-button" onClick={onBack}><Icon name="back" size={16}/> Oturum açmaya dön</button>
  </div>;
}

export function DatabaseReset({ onReset, onSetup, onBack }) {
  const request = useApi('/auth/database-reset');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [backup, setBackup] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const credentials = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError(null);
    try {
      const result = await api('/auth/database-reset', credentials, 'POST');
      setBackup(result.backup);
      setConfirmation('');
      onReset();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  return <div className="account-area">
    <div className="page-title"><h1>Veritabanını sıfırla</h1><p>Bu işlem öğrenci ve öğretmen hesaplarını, sınavları ve sonuçları siler.</p></div>
    <Status request={request}/>
    {backup ? <section className="panel form">
      <div><h2>Veritabanı sıfırlandı</h2><p role="status">Yedek, veri klasörüne kaydedildi.</p></div>
      <code className="backup-path">{backup}</code>
      <button type="button" className="button primary" onClick={onSetup}>İlk öğretmeni kur</button>
    </section> : request.data && (request.data.local ? (request.data.configured ?
      <form className="panel form" onSubmit={submit}>
        <p className="notice">Önce veritabanının yedeği alınır. Kurulum parolanızla ilk öğretmen hesabını yeniden oluşturabilirsiniz.</p>
        {request.data.needsUsername && <label>Eski yönetici kullanıcı adı<input name="username" autoComplete="username" required maxLength={40}/></label>}
        <label>{request.data.needsUsername ? 'Eski yönetici parolası' : 'Kurulum parolası'}<input name="password" type="password"
          autoComplete="current-password" minLength={8} maxLength={128} required/></label>
        <label>Onaylamak için SIFIRLA yazın<input name="confirmation" value={confirmation}
          onChange={event => setConfirmation(event.target.value)} autoComplete="off" required pattern="SIFIRLA"/></label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="button danger" disabled={busy || confirmation !== 'SIFIRLA'}>{busy ? 'Yedek alınıyor ve sıfırlanıyor…' : 'Veritabanını sıfırla'}</button>
      </form> : <p className="notice">Kurulum parolasını belirlemek için kurulum paketini yeniden çalıştırın.</p>) :
      <p className="notice">Bu ekranı ana bilgisayarda <strong>localhost</strong> adresiyle açın.</p>)}
    <button type="button" className="button quiet maintenance-back" onClick={onBack} disabled={busy}>
      <Icon name="back" size={16}/> Oturum açmaya dön</button>
  </div>;
}

function TeacherForm({ first, onCreated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const credentials = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const data = await api('/teacher/accounts', credentials, 'POST');
      form.reset();
      if (data.teacher) setCreated(data.teacher.full_name);
      onCreated(data);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  return <form className="panel form teacher-form" onSubmit={submit}>
    <div><h2>{first ? 'Öğretmen bilgileri' : 'Yeni öğretmen hesabı'}</h2><p className="small muted">Öğretmen bu kullanıcı adı ve parolayla giriş yapar.</p></div>
    <label>Ad soyad<input name="full_name" autoComplete={first ? 'name' : 'off'} minLength={2} maxLength={80} required/></label>
    <label>Kullanıcı adı<input name="username" autoComplete={first ? 'username' : 'off'} minLength={3} maxLength={40} autoCapitalize="none" required/></label>
    <label>Parola<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required aria-describedby="teacher-password-hint"/></label>
    <p id="teacher-password-hint" className="field-hint">En az 8 karakter.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    {created && <p className="notice success" role="status">{created} için öğretmen hesabı oluşturuldu.</p>}
    <button className="button primary" disabled={busy}>{busy ? 'Oluşturuluyor…' : first ? 'İlk öğretmeni oluştur' : 'Öğretmen hesabı oluştur'}</button>
  </form>;
}

export function FirstTeacher({ onUser }) {
  return <div className="account-area">
    <div className="page-title"><h1>İlk öğretmen hesabı</h1><p>Okulun kullanacağı ilk öğretmen hesabını oluşturun.</p></div>
    <TeacherForm first onCreated={data => onUser(data.user)}/>
  </div>;
}

export function DeleteStudentButton({ id, name, onDeleted, compact = false, disabled = false, onBusy }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function erase() {
    if (!window.confirm(name + ' adlı öğrencinin hesabı ve sonuçları kalıcı olarak silinecek. Devam etmek istiyor musunuz?')) return;
    setBusy(true);
    onBusy?.(true);
    setError(null);
    try {
      await api('/teacher/accounts/' + id, undefined, 'DELETE');
      onDeleted();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); onBusy?.(false); }
  }
  return <div className="student-delete">
    <button type="button" className="button danger" aria-label={compact ? name + ' hesabını sil' : undefined}
      disabled={busy || disabled} onClick={erase}>{busy ? 'Siliniyor…' : compact ? 'Sil' : 'Öğrenciyi sil'}</button>
    {error && <p className="small report-error" role="alert">{error}</p>}
  </div>;
}

export function TeacherAccounts() {
  const request = useApi('/teacher/accounts', 5000);
  const [busy, setBusy] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [removed, setRemoved] = useState([]);

  async function approve(account) {
    setError(null);
    setFeedback(null);
    setBusy(account.id);
    try {
      await api('/teacher/accounts/' + account.id + '/approve', {}, 'POST');
      setRemoved(previous => [...previous, account.id]);
      setFeedback(account.full_name + ' onaylandı. Öğrenci artık oturum açabilir.');
    } catch (error) { setError(error.message); }
    finally { setBusy(null); }
  }

  const pending = request.data?.pending.filter(row => !removed.includes(row.id)) ?? [];
  return <>
    <div className="page-title"><h1>Hesap yönetimi</h1><p>Öğrenci kayıtlarını onaylayın ve öğretmen hesapları oluşturun.</p></div>
    <Status request={request}/>
    {error && <p className="notice error" role="alert">{error}</p>}
    {feedback && <p className="notice success" role="status">{feedback}</p>}
    {request.data && <section className="panel">
      <div className="panel-head between"><h2>Onay bekleyen öğrenciler</h2><span className="muted small">{pending.length} başvuru</span></div>
      {pending.length ? <div className="table-wrap account-approvals" role="region" aria-label="Onay bekleyen öğrenci tablosu" tabIndex={0}><table>
        <thead><tr><th scope="col">Öğrenci</th><th scope="col" className="approval-enrollment">Öğrenim yılı</th>
          <th scope="col" className="approval-enrollment">Sınıf</th><th scope="col">Başvuru kaynağı</th><th scope="col" className="numeric">İşlem</th></tr></thead>
        <tbody>{pending.map(account => <tr key={account.id}>
          <th scope="row">{account.full_name}<small>{account.username}</small>
            <small className="approval-mobile-context">{account.academic_year} · {account.class_name}</small></th>
          <td className="approval-enrollment">{account.academic_year}</td><td className="approval-enrollment">{account.class_name}</td>
          <td><dl className="approval-source">
            <div><dt>IP</dt><dd>{account.registration_ip ?? '—'}</dd></div>
            <div><dt>Cihaz</dt><dd>{account.registration_hostname ?? (account.registration_ip ? 'Çözümlenemedi' : '—')}</dd></div>
            <div><dt>Zaman</dt><dd><time dateTime={account.created_at}>{registrationDate.format(new Date(account.created_at))}</time></dd></div>
          </dl></td>
          <td className="numeric"><div className="button-group approval-actions">
            <button type="button" className="button" aria-label={account.full_name + ' hesabını onayla'}
              disabled={Boolean(busy) || deleting} onClick={() => approve(account)}>{busy === account.id ? 'Onaylanıyor…' : 'Onayla'}</button>
            <DeleteStudentButton id={account.id} name={account.full_name} compact disabled={Boolean(busy) || deleting}
              onBusy={setDeleting} onDeleted={() => {
                setRemoved(previous => [...previous, account.id]);
                setFeedback(account.full_name + ' silindi.');
              }}/>
          </div></td>
        </tr>)}</tbody>
      </table></div> : <p className="panel-empty">Onay bekleyen öğrenci kaydı yok.</p>}
    </section>}
    <div className="teacher-account-grid">
      <TeacherForm onCreated={request.retry}/>
      {request.data && <section className="panel">
        <div className="panel-head"><h2>Öğretmen hesapları</h2></div>
        <ul className="teacher-account-list">{request.data.teachers.map(teacher => <li key={teacher.id}>
          <strong>{teacher.full_name}</strong><span className="small muted">{teacher.username}</span>
        </li>)}</ul>
      </section>}
    </div>
  </>;
}
