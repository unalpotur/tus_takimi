import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { complete, createRun, expireRain, matchesCharacter, rainLimit, record, score } from '../shared/training.mjs';
import { Keyboard } from './keyboard.jsx';
import { api, charLabel, clock, format, Icon, Metrics } from './ui.jsx';

function Strip({ run, activity, active, input, onKeyDown, onChange, position }) {
  const text = run?.track ?? activity.text;
  const cursor = run?.typed.length ?? 0;
  const boundary = Math.max(0, Math.floor(cursor / 160) * 160 - 80);
  const start = boundary ? text.lastIndexOf(' ', boundary) + 1 : 0;
  const end = text.indexOf(' ', start + 440);
  const words = text.slice(start, end < 0 ? undefined : end + 1).match(/[^ ]+ ?| /g) ?? [];
  let index = start;
  return <div className={'typing-pad' + (active ? ' engaged' : '')} onClick={() => active && input.current?.focus()}>
    <div className="typing-copy" aria-hidden="true">{words.map((word, wi) => <span className="word" key={wi}>
      {Array.from(word, char => {
        const i = index++;
        const key = run?.typed[i];
        const current = i === (run?.typed.length ?? 0);
        return <span ref={current ? position : null} className={current ? 'cursor' : key == null ? '' : matchesCharacter(char, key) ? 'right' : 'wrong'} key={i}>
          {char === ' ' ? key != null && key !== ' ' ? '·' : '\u00a0' : char}</span>;
      })}
    </span>)}</div>
    <label className="sr-only" htmlFor="typing-input">Yazım alanı</label>
    <input id="typing-input" className="typing-input" ref={input} disabled={!active} value="" aria-describedby="typing-instructions"
      autoComplete="off" spellCheck={false} autoCapitalize="off" onKeyDown={onKeyDown} onChange={onChange}
      onPaste={event => event.preventDefault()} onDrop={event => event.preventDefault()}/>
  </div>;
}

function Arena({ run, activity, elapsed }) {
  if (activity.id === 'rain') {
    const remaining = Math.max(0, rainLimit - (elapsed - (run?.wordStart ?? 0)));
    const word = run?.track || 'kelime';
    const fall = Math.round(100 - remaining / rainLimit * 100);
    const missed = run?.missed ?? 0;
    return <div className="arena rain">
      <div className="arena-label"><span>{(run?.word ?? 0) - missed} tamamlandı · {missed} kaçtı</span><strong>{(remaining / 1000).toFixed(1)} sn</strong></div>
      <div className="rain-field"><div className="rain-word" style={{ '--fall': fall + 'px' }} aria-hidden="true">{word}</div>
        <div className="rain-target">{word}</div></div>
    </div>;
  }
  const words = activity.words?.length ?? 24;
  const correctPrefix = run?.typed.findIndex((char, i) => !matchesCharacter(run.track[i], char)) ?? -1;
  const prefix = run?.track.slice(0, correctPrefix < 0 ? run.typed.length : correctPrefix) ?? '';
  const finished = prefix === run?.track ? words : prefix.split(' ').length - 1;
  const distance = Math.max(0, finished / words) * 100;
  return <div className="arena race">
    <div className="arena-label"><span>{finished} / {words} kelime</span><strong>Finiş</strong></div>
    <div className="road"><span className="lane"/><span className="track-car" style={{ left: 'calc(' + distance + '% * 0.93 + 4px)' }}>
      <svg viewBox="0 0 40 22" width="34" height="20" aria-hidden="true"><path d="M2 9h6l7-6h13l6 6h4v9H2z" fill="#146052"/><circle cx="10" cy="18" r="3" fill="#fff"/><circle cx="31" cy="18" r="3" fill="#fff"/></svg>
    </span><span className="finish-line" aria-hidden="true"/></div>
  </div>;
}

export function Workspace({ initial, layout: preferredLayout, studentId, onUser, onActive, onSaved, guest = false, onExit }) {
  const [phase, setPhase] = useState('ready');
  const [activity, setActivity] = useState(initial);
  const [layout, setLayout] = useState(preferredLayout);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const [layoutHelp, setLayoutHelp] = useState(true);
  const runRef = useRef(null);
  const input = useRef(null);
  const position = useRef(null);
  const instant = useRef(0);
  const attemptId = useRef(null);
  const pending = useRef(null);
  const dirtyDraft = useRef(false);
  const [pressed, setPressed] = useState(null);
  const pressedTimer = useRef(null);
  const [, redraw] = useState(0);
  const run = runRef.current;
  const active = phase === 'active';
  const timer = activity.duration ? Math.max(0, activity.duration - Math.floor(elapsed / 1000)) : Math.floor(elapsed / 1000);
  const metrics = active || phase === 'done' ? score(run, elapsed) : null;
  const expected = run ? run.track[run.typed.length] : activity.text?.[0];
  const classExam = initial.type === 'class_exam';
  const draftKey = classExam ? 'atolye:exam:' + studentId + ':' + initial.id : null;

  function persistDraft() {
    if (!draftKey || !dirtyDraft.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ id: attemptId.current, events: runRef.current.events }));
      dirtyDraft.current = false;
    } catch { /* The running exam and result upload still work if storage is unavailable. */ }
  }

  useEffect(() => {
    if (!draftKey) return undefined;
    window.addEventListener('pagehide', persistDraft);
    const timer = setInterval(persistDraft, 1000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', persistDraft);
      persistDraft();
    };
  }, [draftKey]);

  useEffect(() => {
    onActive?.(phase === 'active' || phase === 'starting' || phase === 'saving' || (phase === 'done' && Boolean(error) && Boolean(pending.current)));
    return () => onActive?.(false);
  }, [phase, error, onActive]);
  useEffect(() => () => clearTimeout(pressedTimer.current), []);
  useLayoutEffect(() => {
    if (active) input.current?.focus({ preventScroll: true });
  }, [active]);
  useLayoutEffect(() => {
    const target = position.current;
    const scroller = target?.closest('.typing-pad');
    if (!scroller) return;
    const outer = scroller.getBoundingClientRect();
    const inner = target.getBoundingClientRect();
    if (inner.bottom > outer.bottom - 4 || inner.top < outer.top + 4) {
      scroller.scrollTop += inner.top - outer.top - 16;
    }
  });

  async function save() {
    setPhase('saving');
    setError(null);
    try {
      const data = await api('/results/submit', pending.current, 'POST');
      pending.current = null;
      dirtyDraft.current = false;
      if (draftKey) try { localStorage.removeItem(draftKey); } catch { /* Result is already saved. */ }
      setSaved(data.result);
      onUser(data.user);
      onSaved?.();
    } catch (error) {
      setError(error.message);
    } finally {
      setPhase('done');
    }
  }

  function finish(ms) {
    const current = runRef.current;
    if (!instant.current) return;
    instant.current = 0;
    const time = Math.floor(ms);
    setElapsed(time);
    expireRain(current, time);
    persistDraft();
    setPhase('done');
    if (guest) return;
    if (activity.type === 'placement_test' && !current.total) {
      setError('Sınavı kaydetmek için en az bir karakter yazman gerekiyor.');
      return;
    }
    pending.current = { id: attemptId.current, elapsed: time, events: current.events };
    void save();
  }

  useEffect(() => {
    if (!active) return undefined;
    const limit = activity.duration * 1000;
    const timerId = setInterval(() => {
      if (!instant.current) return;
      const ms = Math.floor(performance.now() - instant.current);
      if (limit && ms >= limit) return finish(limit);
      if (!limit && ms > 1_800_000) {
        instant.current = 0;
        setPhase('done');
        setError('Alıştırmanın 30 dakikalık süresi doldu.');
        return;
      }
      expireRain(runRef.current, ms);
      setElapsed(ms);
      if (complete(runRef.current)) finish(ms);
    }, activity.id === 'rain' ? 32 : 100);
    return () => clearInterval(timerId);
  }, [active, activity]);

  async function start() {
    setPhase('starting');
    setElapsed(0);
    setError(null);
    setSaved(null);
    pending.current = null;
    try {
      let next = initial;
      let resumed = 0;
      if (!guest) {
        const issued = classExam ? await api('/class-exams/' + initial.id + '/start', { layout: preferredLayout }, 'POST') :
          await api('/attempts', { activity: initial.id, layout, duration: initial.duration }, 'POST');
        attemptId.current = issued.id;
        next = issued.activity;
        if (classExam) {
          setLayout(issued.layout);
          resumed = issued.elapsed;
        }
      }
      setActivity(next);
      runRef.current = createRun(next);
      if (draftKey) {
        try {
          const draft = JSON.parse(localStorage.getItem(draftKey));
          if (draft?.id === attemptId.current && Array.isArray(draft.events)) {
            for (const [ms, key] of draft.events) record(runRef.current, key, ms);
            resumed = Math.max(resumed, runRef.current.events.at(-1)?.[0] ?? 0);
          }
        } catch { /* An unreadable local draft cannot be restored. */ }
      }
      setElapsed(resumed);
      instant.current = performance.now() - resumed;
      setPhase('active');
    } catch (error) {
      setError(error.message);
      setPhase('ready');
    }
  }

  function type(key) {
    if (!instant.current || !active) return;
    const ms = Math.floor(performance.now() - instant.current);
    const limit = activity.duration * 1000;
    if (limit && ms >= limit) return finish(limit);
    expireRain(runRef.current, ms);
    if (!complete(runRef.current) && record(runRef.current, key, ms)) {
      if (classExam) dirtyDraft.current = true;
      setPressed(key);
      clearTimeout(pressedTimer.current);
      pressedTimer.current = setTimeout(() => setPressed(null), 90);
      setElapsed(ms);
      redraw(count => count + 1);
    }
    if (complete(runRef.current)) finish(ms);
  }
  function keydown(event) {
    if (event.nativeEvent.isComposing || event.metaKey || (event.ctrlKey || event.altKey) && !event.getModifierState('AltGraph')) return;
    if (event.key === 'Backspace' || /^[^\p{C}\p{M}]$/u.test(event.key)) {
      event.preventDefault();
      if (!event.repeat || event.key === 'Backspace') type(event.key);
    }
  }
  const instruction = activity.id === 'rain' ? 'Düşen kelimeyi boşluk bırakmadan yaz.' :
    activity.id === 'race' ? 'Kelimeler arasında boşluk bırak. Bir hata olursa geri sil.' :
    'Metni olduğu gibi yaz. Hatalı bir vuruşu geri silerek düzeltebilirsin.';

  return <section className="panel workspace">
    <div className="panel-head between flex items-center justify-between gap-3">
      <div><h2>{activity.title}</h2><p className="muted small">{activity.duration ? clock(activity.duration) : 'Süresiz alıştırma'} <span aria-hidden="true">·</span> Türkçe {layout}</p></div>
      {onExit && <button className="button quiet" onClick={onExit}><Icon name="back" size={16}/> Geri</button>}
      {!onExit && <Icon name="keyboard" size={22}/>}
    </div>
    <Metrics compact items={[
      [activity.duration ? 'Kalan süre' : 'Geçen süre', clock(timer)],
      ['Net hız', format(metrics?.wpm ?? 0), 'WPM'],
      ['Doğruluk', metrics && run.total ? '%' + format(metrics.accuracy) : '—'],
      ['Hata', metrics?.error_count ?? 0]
    ]}/>
    {activity.type === 'game' && <Arena run={run} activity={activity} elapsed={elapsed}/>}
    <p id="typing-instructions" className="muted small typing-instruction">
      {instruction}{active && activity.id === 'rain' ? ' Sıradaki kelime “' + (run?.track ?? '') + '”.' : ''}
    </p>
    <span className="sr-only">{activity.id !== 'rain' && (run?.track ?? activity.text)?.slice(run?.typed.length ?? 0, (run?.typed.length ?? 0) + 160)}</span>
    <Strip run={run} activity={{ ...activity, text: activity.text || (activity.id === 'rain' ? 'kelime' : 'Başlattığında yazılacak metin burada görünecek.') }}
      active={active} input={input} position={position} onKeyDown={keydown}
      onChange={event => { if (/^[^\p{C}\p{M}]$/u.test(event.target.value)) type(event.target.value); }}/>
    <div className="workspace-actions between">
      <div className="button-group">
        {(['ready', 'starting'].includes(phase) || (phase === 'done' && !classExam)) && <button className="button primary" disabled={phase === 'starting' || Boolean(pending.current)}
          onClick={start}>{phase === 'starting' ? 'Başlatılıyor…' : phase === 'done' ? 'Yeniden başlat' :
            classExam && initial.status === 'awaiting_submission' ? 'Sonucu gönder' :
              classExam && initial.status === 'started' ? 'Sınava devam et' : classExam || activity.id === 'placement' ? 'Sınavı başlat' :
              activity.type === 'game' ? 'Oyunu başlat' : 'Yazmaya başla'}</button>}
        {active && <><button className="button" onClick={() => input.current?.focus()}>Yazım alanına dön</button>
          {classExam ? <button className="button quiet" onClick={onExit}>Sınav listesine dön</button> : <button className="button quiet" onClick={() => {
            if (!window.confirm('Bu çalışmayı bitirmeden bırakmak istiyor musun?')) return;
            instant.current = 0; runRef.current = null; setElapsed(0); setPhase('ready');
          }}>Vazgeç</button>}</>}
        {phase === 'saving' && <span role="status">Sonuç kaydediliyor…</span>}
        {phase === 'done' && error && pending.current && <button className="button primary" onClick={save}>Kaydı yeniden dene</button>}
      </div>
      <button className="button quiet keyboard-toggle" aria-pressed={layoutHelp} onClick={() => setLayoutHelp(value => !value)}>
        <Icon name="keyboard" size={17}/> {layoutHelp ? 'Klavyeyi gizle' : 'Klavyeyi göster'}</button>
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {phase === 'done' && !error && <p className="notice success" role="status">
      {guest ? 'Isınma tamamlandı.' : 'Sonuç kaydedildi.'}
      {saved?.activity_type === 'placement_test' && ' Türkçe ' + layout + ' seviyen ' + saved.resulting_level + '.'}
      {metrics && ' ' + metrics.net_characters + ' net vuruş · ' + format(metrics.wpm) + ' WPM · %' + format(metrics.accuracy) + ' doğruluk'}</p>}
    {layoutHelp && <Keyboard layout={layout} expected={expected} pressed={pressed} onKey={active && !classExam && activity.type !== 'placement_test' ?
      key => { type(key); input.current?.focus({ preventScroll: true }); } : undefined}/>}
  </section>;
}
