import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { examDurations, levels, lessonsFor, preview, skillGames } from '../shared/training.mjs';
import { Admin, Progress } from './analytics.jsx';
import { DatabaseReset, FirstTeacher, SetupAccess, TeacherAccounts } from './accounts.jsx';
import { SchoolCatalog } from './school-catalog.jsx';
import { AdminExams, canEnterClassExam, StudentExams } from './class-exams.jsx';
import { Workspace } from './activities.jsx';
import { Hands, Keyboard } from './keyboard.jsx';
import { api, charLabel, clock, format, Icon, LayoutSwitch, Mark, Metrics, minutes, Status, useApi } from './ui.jsx';

const studentLinks = [
  ['atolye', 'Atölye', 'board'], ['dersler', 'Alıştırmalar', 'book'], ['sinav', 'Seviye sınavı', 'timer'],
  ['sinif-sinavlari', 'Sınıf sınavlarım', 'flag'], ['oyunlar', 'Mini oyunlar', 'game'], ['gelisim', 'Gelişimim', 'chart']
];
const validRoutes = new Set([...studentLinks.map(item => item[0]), 'rehber', 'profil', 'giris', 'kayit', 'sinif', 'sinav-yonetimi', 'kurulum', 'hesap-yonetimi', 'veritabani', 'yil-ve-siniflar']);
const teacherLinks = [['sinif', 'Sınıf takibi', 'chart'], ['sinav-yonetimi', 'Sınıf sınavları', 'flag'],
  ['hesap-yonetimi', 'Hesap yönetimi', 'user'], ['yil-ve-siniflar', 'Yıl ve sınıflar', 'settings']];
const route = () => validRoutes.has(location.hash.slice(1)) ? location.hash.slice(1) : 'atolye';
const startExam = { id: 'placement', type: 'placement_test', title: 'Seviye sınavı', duration: 60 };

function Title({ title, description, children }) {
  return <div className="page-title between">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children}
  </div>;
}

function Account({ register, go, onUser, next }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const setup = useApi(register ? null : '/auth/setup');
  const maintenance = useApi(register ? null : '/auth/database-reset');
  const enrollment = useEnrollmentSelection(register);
  const errorNode = useRef(null);
  useEffect(() => { if (error) errorNode.current?.focus(); }, [error]);
  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError(null);
    try {
      const { user } = await api('/auth/' + (register ? 'register' : 'login'), body, 'POST');
      if (register) setSubmitted(true);
      else {
        onUser(user);
        go(user.role === 'teacher' ? 'sinif' : user.role === 'bootstrap' ? 'kurulum' : next || 'atolye');
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  if (submitted) return <div className="account-area">
    <Title title="Başvurun alındı" description="Öğretmenin hesabını onayladıktan sonra kullanıcı adın ve parolanla oturum açabilirsin."/>
    <button className="button primary" onClick={() => go('giris')}>Oturum açmaya dön</button>
  </div>;
  return <div className="account-area">
    <Title title={register ? 'Öğrenci hesabı oluştur' : 'Oturum aç'}
      description={register ? 'Öğretmenin başvurunu onayladığında hesabınla oturum açabilirsin.' : 'Öğrenci veya öğretmen hesabınla devam et.'}/>
    <form className="panel form" onSubmit={submit}>
      {error && <p className="notice error" role="alert" ref={errorNode} tabIndex={-1}>{error}</p>}
      {register && <label>Ad soyad<input name="full_name" autoComplete="name" required minLength={2} maxLength={80}/></label>}
      <label>Kullanıcı adı<input name="username" autoComplete="username" required minLength={3} maxLength={40} autoCapitalize="none"
        aria-describedby={register ? 'username-hint' : undefined}/></label>
      {register && <p className="field-hint" id="username-hint">3–40 karakter. Harf, rakam, nokta, alt çizgi veya tire kullanabilirsin.</p>}
      <label>Parola<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'}
        required minLength={8} maxLength={128} aria-describedby={register ? 'password-hint' : undefined}/></label>
      {register && <><p className="field-hint" id="password-hint">En az 8 karakter.</p><Enrollment {...enrollment}/>
        <label>Klavye düzeni<select name="preferred_keyboard" aria-label="Klavye düzeni"><option value="F">Türkçe F</option><option value="Q">Türkçe Q</option></select></label></>}
      <button className="button primary" disabled={busy || (register && !enrollment.valid)}>{busy ? 'Bekleyin…' : register ? 'Başvuru gönder' : 'Oturum aç'}</button>
      <p className="muted small">{register ? 'Zaten hesabın var mı?' : 'Öğrenci hesabın yok mu?'}{' '}
        <a href={register ? '#giris' : '#kayit'} onClick={event => { event.preventDefault(); go(register ? 'giris' : 'kayit'); }}>
          {register ? 'Oturum aç' : 'Hesap oluştur'}</a></p>
      {!register && setup.data && !setup.data.initialized && <p className="muted small"><a href="#kurulum"
        onClick={event => { event.preventDefault(); go('kurulum'); }}>İlk öğretmeni kur</a></p>}
      {!register && maintenance.data?.local && <p className="muted small"><a href="#veritabani"
        onClick={event => { event.preventDefault(); go('veritabani'); }}>Veritabanını sıfırla</a></p>}
    </form>
  </div>;
}

function useEnrollmentSelection(enabled, user) {
  const request = useApi(enabled ? '/enrollment' : null);
  const [selection, setSelection] = useState({ year: user?.academic_year ?? '', className: user?.class_name ?? '' });
  const years = request.data?.years ?? [];
  const classes = years.find(item => item.year === selection.year)?.classes ?? [];
  return { request, years, classes, selection, setSelection, valid: classes.includes(selection.className) };
}

function Enrollment({ request, years, classes, selection, setSelection }) {
  return <>
    <Status request={request}/>
    {request.data && !years.some(item => item.classes.length) &&
      <p className="notice">Henüz tanımlı sınıf yok. Öğretmenin bir sınıf oluşturduğunda seçim yapabilirsin.</p>}
    <div className="field-grid">
      <label>Öğrenim yılı<select name="academic_year" aria-label="Öğrenim yılı" value={selection.year} disabled={!years.length} required
        onChange={event => setSelection({ year: event.target.value, className: '' })}>
        <option value="">Yıl seç</option>{years.map(item => <option key={item.year}>{item.year}</option>)}</select></label>
      <label>Sınıf<select name="class_name" aria-label="Sınıf" value={selection.className} disabled={!classes.length} required
        onChange={event => setSelection({ ...selection, className: event.target.value })}>
        <option value="">{selection.year && !classes.length ? 'Tanımlı sınıf yok' : 'Sınıf seç'}</option>
        {classes.map(className => <option key={className}>{className}</option>)}</select></label>
    </div>
  </>;
}

function Profile({ user, setUser }) {
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const enrollment = useEnrollmentSelection(true, user);
  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setMessage(null);
    try {
      const { user: updated } = await api('/profile', body, 'PATCH');
      setUser(updated);
      setMessage({ text: 'Sınıf bilgilerin güncellendi.' });
    } catch (error) { setMessage({ text: error.message, error: true }); }
    finally { setBusy(false); }
  }
  return <div className="account-area">
    <Title title="Sınıf bilgilerim" description={user.full_name}/>
    <form className="panel form" onSubmit={submit}>
      <Enrollment {...enrollment}/>
      <button className="button primary" disabled={busy || !enrollment.valid}>{busy ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}</button>
      {message && <p role={message.error ? 'alert' : 'status'} className={'notice ' + (message.error ? 'error' : 'success')}>{message.text}</p>}
    </form>
  </div>;
}

function Locked({ onAuth, text }) {
  return <div className="panel signed-out"><Icon name="lock" size={22}/><div><h2>Öğrenci girişi gerekli</h2><p className="muted">{text}</p></div>
    <button className="button primary" onClick={onAuth}>Oturum aç</button></div>;
}

function Roadmap({ level, completed, go }) {
  return <section className="panel roadmap">
    <div className="panel-head between"><div><h2>Öğrenme yolu</h2><p className="muted small">{completed || 0} tamamlanan ders</p></div>
      <button className="icon-button" aria-label="Tüm alıştırmaları aç" onClick={() => go('dersler')}><Icon name="chevron" size={18}/></button></div>
    <ol>{levels.map((item, index) => <li key={item.title}>
      <button className={index + 1 === level ? 'current' : ''} onClick={() => go('dersler')}>
        <span className="step">{index + 1}</span><span><strong>{item.title}</strong>
          <span>{index + 1 === level ? 'Mevcut seviye' : item.detail}</span></span>
        {index + 1 > level && <Icon name="lock" size={15}/>}
        {index + 1 < level && <Icon name="check" size={17}/>}
      </button>
    </li>)}</ol>
  </section>;
}

function Home({ user, layout, go, onActive, overview, lessons, level, activeExams }) {
  const data = overview.data;
  const today = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return <>
    <div className="page-title home-title">
      <div className="date">{today}</div>
      <h1>{user ? 'Merhaba, ' + user.full_name.split(' ')[0] + '.' : 'On parmak atölyesi'}</h1>
      <p>{user ? user.academic_year + ' · ' + user.class_name + ' · Türkçe ' + layout :
        'Tuşların yerini öğren, doğru parmakla yaz ve hızını ölç.'}</p>
    </div>
    <Status request={overview}/>
    {activeExams > 0 && <section className="panel exam-home between">
      <div><h2>{activeExams === 1 ? 'Bir sınıf sınavın var' : activeExams + ' sınıf sınavın var'}</h2>
        <p className="muted small">Öğretmeninin yayımladığı sınavları görüntüle.</p></div>
      <button className="button" onClick={() => go('sinif-sinavlari')}>Sınavları aç</button>
    </section>}
    <Metrics items={[
      ['Seviye', user ? level : '—', user ? '/ 5' : null],
      ['Ort. net hız', format(data?.summary.wpm), 'WPM'],
      ['Ort. doğruluk', data?.summary.accuracy == null ? '—' : '%' + format(data.summary.accuracy)],
      ['Çalışma süresi', user && !data ? '—' : minutes(data?.summary.seconds)]
    ]}/>
    <div className="home-grid">
      <Workspace key={layout} initial={preview(layout)} layout={layout} guest onActive={onActive}/>
      <aside className="home-aside">
        <Roadmap level={level} completed={lessons?.filter(item => item.completed).length} go={go}/>
        <section className="panel exam-prompt">
          <Icon name="timer" size={21}/>
          <div><h2>Seviye sınavı</h2><p className="muted small">Süre seç, hızını ve doğruluğunu ölç.</p></div>
          <button className="button" onClick={() => go('sinav')}>Sınavı aç</button>
        </section>
      </aside>
    </div>
  </>;
}

function Lessons({ user, layout, go, request, open }) {
  const weakness = useApi(user ? '/lessons/custom-weakness?layout=' + layout : null);
  const items = request.data?.lessons ?? (!user ? lessonsFor(layout).map(item => ({ ...item, locked: item.level > 1 })) : []);
  return <>
    <Title title="Alıştırmalar" description="Seviyene uygun derslerle doğru parmak kullanımını geliştir."/>
    <Status request={request}/>
    {!user && <Locked text="Dersleri kaydetmek ve yeni seviyelerin kilidini açmak için oturum aç." onAuth={() => go('giris', 'dersler')}/>}
    {user && <section className="panel">
      <div className="panel-head between"><div><h2>Hata odaklı çalışma</h2><p className="muted small">{weakness.data?.weaknesses.length ?
        'En sık zorlandığın tuşlar · ' + weakness.data.weaknesses.slice(0, 4).map(key => charLabel(key.expected_char)).join(' · ') :
        'Yazım hataların kaydedildikçe sana özel bir çalışma hazırlanır.'}</p></div>
        <button className="button" disabled={!weakness.data?.activity} onClick={() => open(weakness.data.activity)}>Özel çalışmayı aç</button></div>
      <Status request={weakness}/>
    </section>}
    {!!items.length && <div className="lesson-grid">{levels.map((level, index) => <section className="panel" key={level.title}>
      <div className="panel-head"><h2>{index + 1}. {level.title}</h2><p className="small muted">{level.detail}</p></div>
      <ul className="lesson-list">{items.filter(item => item.level === index + 1).map((item, part) => <li key={item.id}>
        <span>{part + 1}. çalışma {item.completed && <small>Tamamlandı</small>}</span>
        <button className="button quiet" disabled={Boolean(item.locked)} onClick={() => user ? open(item) : go('giris', 'dersler')}
          aria-label={item.title + (item.locked ? ' kilitli' : ' aç')}><Icon name={item.locked ? 'lock' : item.completed ? 'check' : 'chevron'} size={17}/>
          {item.locked ? 'Kilitli' : 'Aç'}</button></li>)}</ul>
    </section>)}</div>}
  </>;
}

function Exam({ user, level, request, open, go, duration, onDuration }) {
  const next = levels[level];
  const placed = request.data?.placed;
  return <>
    <Title title="Seviye sınavı" description="Sınav süresini seçip yazım hızını ve doğruluğunu ölç."/>
    <Status request={request}/>
    <section className="panel exam-intro">
      <div><h2>{placed ? next ? 'Bir üst seviyenin hedefi' : 'Uzman seviye' : 'İlk seviye tespiti'}</h2>
        <p>{placed && next ? 'Seviye ' + (level + 1) + ' için en az ' + next.wpm + ' WPM ve %' + next.accuracy + ' doğruluk gerekir.' :
          placed ? 'Tekrar sınava girerek gelişimini ölçebilirsin.' : 'İlk sınavda sonuçlarına göre 1–5 arasında bir seviye atanır.'}</p>
        <p className="muted">Sınavı başlattığında süre işlemeye başlar. Hataları silme tuşuyla düzeltebilirsin.</p>
        <label className="filter exam-duration">Sınav süresi<select value={duration} onChange={event => onDuration(Number(event.target.value))}>
          {examDurations.map(seconds => <option key={seconds} value={seconds}>{seconds / 60} dakika</option>)}
        </select></label>
        {user && <button className="button primary" onClick={() => open({ ...startExam, duration })}>Sınav ekranını aç</button>}</div>
      <div className="exam-clock"><Icon name="timer" size={28}/><strong>{clock(duration)}</strong></div>
    </section>
    {!user && <Locked text="Sınav sonucunun kaydedilmesi için oturum aç." onAuth={() => go('giris', 'sinav')}/>}
    <section className="panel">
      <div className="panel-head"><h2>Seviye hedefleri</h2></div>
      <div className="table-wrap"><table><thead><tr><th scope="col">Seviye</th><th scope="col" className="numeric">Net hız</th>
        <th scope="col" className="numeric">Doğruluk</th></tr></thead><tbody>
        {levels.map((item, index) => <tr key={item.title}><th scope="row">{index + 1} · {item.title}</th>
          <td className="numeric">{index ? item.wpm + '+ WPM' : '—'}</td><td className="numeric">{index ? '%' + item.accuracy + '+' : '—'}</td></tr>)}
      </tbody></table></div>
    </section>
  </>;
}

function Games({ user, open, go }) {
  return <>
    <Title title="Mini oyunlar" description="Kelimelerle zaman tutarak yazma refleksini geliştir."/>
    <div className="lesson-grid">{skillGames.map(game => <section className="panel game-card" key={game.id}>
      <div className="panel-head"><Icon name={game.id === 'rain' ? 'cloud' : 'flag'} size={28}/><h2>{game.title}</h2><p className="muted">{game.detail}</p></div>
      <div className="panel-foot between"><span className="muted small">{game.duration} saniye</span><button className="button"
        onClick={() => user ? open({ ...game, type: 'game' }) : go('giris', 'oyunlar')}>{user ? 'Oyunu aç' : 'Oturum aç'}</button></div>
    </section>)}</div>
  </>;
}

function Guide({ layout }) {
  return <>
    <Title title="Parmak rehberi" description={'Türkçe ' + layout + ' klavyede temel sıra ve oturuş'}/>
    <section className="panel guide-layout">
      <div className="panel-head"><h2>Temel sıra</h2><p className="muted">Tuşun üzerine geldiğinde kullanacağın parmağın adını görebilirsin.</p></div>
      <Keyboard layout={layout} guide/>
    </section>
    <section className="panel guide-tip"><Hands/><div><h2>Yazmaya hazırlan</h2>
      <ol><li>Ayaklarını yere bas, sırtını dik ve omuzlarını rahat tut.</li>
        <li>Dirseklerini yaklaşık 90° bük, bileklerini düz tut.</li>
        <li>{layout === 'F' ? 'Sol elini U · İ · E · A, sağ elini K · M · L · Y üzerine' :
          'Sol elini A · S · D · F, sağ elini J · K · L · Ş üzerine'} yerleştir.</li>
        <li>Başparmaklarından biriyle boşluğa bas. Her vuruştan sonra parmağını temel sıraya döndür.</li>
      </ol></div></section>
  </>;
}

function App() {
  const [page, setPage] = useState(route);
  const [user, setUserState] = useState(null);
  const [ready, setReady] = useState(false);
  const [accountError, setAccountError] = useState(null);
  const [layout, setLayout] = useState('F');
  const [activity, setActivity] = useState(null);
  const [examDuration, setExamDuration] = useState(60);
  const [active, setActive] = useState(false);
  const [next, setNext] = useState(null);
  const [revision, setRevision] = useState(0);
  const [menu, setMenu] = useState(false);
  const student = user?.role === 'student';
  const teacher = user?.role === 'teacher';
  const bootstrap = user?.role === 'bootstrap';
  const level = user?.['current_level_' + layout.toLowerCase()] ?? 1;
  const overview = useApi(student && (page === 'atolye' || page === 'sinav') ? '/results?layout=' + layout + '&refresh=' + revision : null);
  const lessons = useApi(student && (page === 'dersler' || page === 'atolye') ? '/lessons?layout=' + layout + '&refresh=' + revision : null);
  const classExams = useApi(student ? '/class-exams?account=' + user.id : null, 5000);
  const activeExams = classExams.data?.exams.filter(canEnterClassExam).length ?? 0;
  const setUser = useCallback(nextUser => { setUserState(nextUser); if (nextUser) setLayout(nextUser.preferred_keyboard); }, []);
  const refreshUser = useCallback(async () => {
    setReady(false);
    setAccountError(null);
    try { setUser((await api('/auth/me')).user); }
    catch (error) { if (error.status !== 401) setAccountError(error.message); }
    finally { setReady(true); }
  }, [setUser]);
  useEffect(() => { void refreshUser(); }, [refreshUser]);
  const allowedExit = () => !active || window.confirm(activity?.type === 'class_exam' ?
    'Bu ekrandan ayrılırsan sınav süren işlemeye devam eder. Ayrılmak istiyor musun?' :
    'Süren veya kaydedilmemiş çalışman var. Bu ekrandan ayrılmak istiyor musun?');
  useEffect(() => {
    const handleHash = () => {
      if (!allowedExit()) { history.replaceState(null, '', '#' + page); return; }
      setPage(route()); setActivity(null); setMenu(false);
    };
    const handleUnload = event => { if (active) event.preventDefault(); };
    window.addEventListener('hashchange', handleHash);
    window.addEventListener('beforeunload', handleUnload);
    return () => { window.removeEventListener('hashchange', handleHash); window.removeEventListener('beforeunload', handleUnload); };
  }, [active, activity, page]);
  const go = (target, returnTo) => {
    if ((activity || target !== page) && !allowedExit()) return;
    if (returnTo) setNext(returnTo);
    if (target !== 'giris' && target !== 'kayit' && !returnTo) setNext(null);
    history.pushState(null, '', '#' + target);
    if (target !== page || activity) setActivity(null);
    setPage(target);
    setMenu(false);
    window.scrollTo(0, 0);
  };
  const closeActivity = () => {
    if (!allowedExit()) return;
    if (activity?.type === 'class_exam') classExams.retry();
    setActivity(null);
  };
  const openActivity = item => { setActivity(item); window.scrollTo(0, 0); };
  async function changeLayout(value) {
    if (value === layout || !allowedExit()) return;
    setAccountError(null);
    if (!student) { setLayout(value); return; }
    try {
      const { user: updated } = await api('/profile', { preferred_keyboard: value }, 'PATCH');
      setUser(updated);
      setActivity(null);
    } catch (error) { setAccountError(error.message); }
  }
  async function logout() {
    if (!allowedExit()) return;
    try {
      await api('/auth/logout', {}, 'POST');
      setUser(null); setActivity(null); setPage('giris'); setMenu(false);
      history.replaceState(null, '', '#giris');
    } catch (error) { setAccountError(error.message); }
  }
  const links = !user ? [['giris', 'Oturum aç', 'login'], ['kayit', 'Öğrenci başvurusu', 'user']] :
    bootstrap ? [['kurulum', 'İlk öğretmen', 'user'], ['veritabani', 'Veritabanını sıfırla', 'settings']] : teacher ? teacherLinks : studentLinks;
  const teacherPage = teacherLinks.some(link => link[0] === page);
  const publicPages = ['giris', 'kayit', 'kurulum', 'veritabani'];
  const view = !user && !publicPages.includes(page) ? 'giris' : page === 'veritabani' ? page : bootstrap ? 'kurulum' : teacher ? teacherPage ? page : 'sinif' :
    teacherPage || (student && page === 'kurulum') ? 'atolye' : page;
  const home = !user ? 'giris' : bootstrap ? 'kurulum' : teacher ? 'sinif' : 'atolye';
  const navLink = ([id, label, icon]) => <a key={id} href={'#' + id} className={'nav-link' + (id === view ? ' selected' : '')}
    aria-current={id === view ? 'page' : undefined} onClick={event => { event.preventDefault(); go(id); }}><Icon name={icon}/>{label}</a>;

  let content;
  if (!ready) content = <p className="notice" role="status">Atölye açılıyor…</p>;
  else if (view === 'veritabani') content = <DatabaseReset onReset={() => { setUser(null); setActivity(null); setAccountError(null); }}
    onSetup={() => go('kurulum')} onBack={() => go(user ? home : 'giris')}/>;
  else if (bootstrap) content = <FirstTeacher onUser={updated => { setUser(updated); go('sinif'); }}/>;
  else if (teacher) content = view === 'hesap-yonetimi' ? <TeacherAccounts/> : view === 'yil-ve-siniflar' ? <SchoolCatalog/> :
    view === 'sinav-yonetimi' ? <AdminExams onManage={() => go('yil-ve-siniflar')}/> : <Admin/>;
  else if (view === 'kurulum') content = <SetupAccess onUser={updated => { setUser(updated); go('kurulum'); }} onBack={() => go('giris')}/>;
  else if (activity && student) content = <>
    <Title title={activity.type === 'class_exam' ? 'Sınıf sınavı' : activity.type === 'placement_test' ? 'Seviye sınavı' : activity.type === 'game' ? 'Mini oyunlar' : 'Alıştırmalar'}/>
    <Workspace key={activity.id + layout} initial={activity} layout={layout} studentId={user.id} onActive={setActive} onUser={setUserState}
      onSaved={() => { setRevision(value => value + 1); if (activity.type === 'class_exam') classExams.retry(); }} onExit={closeActivity}/>
  </>;
  else if (view === 'giris' || view === 'kayit') content = <Account key={view} register={view === 'kayit'} go={go} onUser={setUser} next={next}/>;
  else if (view === 'dersler') content = <Lessons user={user} layout={layout} go={go} request={lessons} open={openActivity}/>;
  else if (view === 'sinav') content = <Exam user={user} level={level} request={overview} go={go} open={openActivity} duration={examDuration} onDuration={setExamDuration}/>;
  else if (view === 'sinif-sinavlari') content = student ? <StudentExams request={classExams} open={openActivity}/> :
    <><Title title="Sınıf sınavlarım"/><Locked text="Öğretmeninin yayımladığı sınavları görmek için oturum aç." onAuth={() => go('giris', 'sinif-sinavlari')}/></>;
  else if (view === 'oyunlar') content = <Games user={user} go={go} open={openActivity}/>;
  else if (view === 'gelisim') content = <><Title title="Gelişimim" description={'Yazım hızın, doğruluğun ve tamamladığın çalışmalar · Türkçe ' + layout}/>
    {student ? <Progress layout={layout} revision={revision}/> : <Locked text="Gelişim grafiğini görmek için oturum aç." onAuth={() => go('giris', 'gelisim')}/>}</>;
  else if (view === 'rehber') content = <Guide layout={layout}/>;
  else if (view === 'profil') content = student ? <Profile user={user} setUser={setUser}/> :
    <Locked text="Sınıf bilgilerini düzenlemek için oturum aç." onAuth={() => go('giris', 'profil')}/>;
  else content = <Home user={user} layout={layout} go={go} onActive={setActive} overview={overview}
    lessons={lessons.data?.lessons} level={level} activeExams={activeExams}/>;

  return <div className="app-shell">
    <a className="skip" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>İçeriğe geç</a>
    <aside className="sidebar">
      <a className="brand" href={'#' + home} onClick={event => { event.preventDefault(); go(home); }}>
        <Mark/><span><strong>Tuş Atölyesi</strong><small>On parmak eğitimi</small></span>
      </a>
      <button className="button quiet mobile-menu" aria-expanded={menu} aria-controls="side-content" onClick={() => setMenu(value => !value)}>
        <Icon name="board"/> Menü</button>
      <div className={'side-content' + (menu ? ' expanded' : '')} id="side-content">
        <nav aria-label="Ana menü"><span className="nav-caption">{bootstrap ? 'Kurulum' : teacher ? 'Öğretmen paneli' : 'Çalışma alanı'}</span>{links.map(navLink)}
          {student && <><span className="nav-caption help">Yardım</span>{navLink(['rehber', 'Parmak rehberi', 'hand'])}</>}
        </nav>
        <div className="sidebar-end">
          {student && <nav aria-label="Hesap">{navLink(['profil', 'Sınıf bilgilerim', 'settings'])}</nav>}
          {user && <><div className="account-row">
            <span className="account-icon">{user.full_name.slice(0, 1).toLocaleUpperCase('tr')}</span>
            <div><strong>{user.full_name}</strong><small>{bootstrap ? 'İlk hesap kurulumu' : teacher ? 'Öğretmen' : user.class_name}</small></div>
          </div><button className="nav-link" onClick={logout}><Icon name="logout"/> Oturumu kapat</button></>}
        </div>
      </div>
    </aside>
    <main id="main" className="main" tabIndex={-1}>
      <header className="masthead between">
        <span className="context flex items-center gap-2"><Icon name={teacher ? 'chart' : 'screen'} size={17}/>{bootstrap ? 'İlk hesap kurulumu' : teacher ? 'Öğretmen çalışma alanı' : 'Klavye çalışma alanı'}</span>
        {student && !['giris', 'kayit', 'kurulum', 'veritabani'].includes(view) && <LayoutSwitch layout={layout} onChange={changeLayout} disabled={active}/>}
      </header>
      <div className="canvas" data-ui>
        {accountError && <div className="notice error between" role="alert">{accountError}
          <button className="button quiet" onClick={refreshUser}>Oturumu kontrol et</button></div>}
        {content}
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
