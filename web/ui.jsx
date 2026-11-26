import { useEffect, useState } from 'react';

const icons = {
  board: 'M3 5h18v14H3z M3 10h18 M9 10v9',
  book: 'M4 4h12a3 3 0 0 1 3 3v13H6a2 2 0 0 1-2-2z M4 16h15 M8 8h7 M8 12h5',
  timer: 'M9 2h6 M12 2v3 M19 6l2-2 M12 9v4l3 2 M21 13a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  game: 'M7 7h10c2 0 3 1 4 4l1 4c.6 3-2 4-4 2l-2-2H8l-2 2c-2 2-4.6 1-4-2l1-4c1-3 2-4 4-4z M7 10v4 M5 12h4 M16 11h.01 M19 13h.01',
  chart: 'M4 4v16h16 M8 15l4-5 3 2 5-6',
  hand: 'M7 12V7a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-13 4l-3-5a1.6 1.6 0 0 1 2-2l2 1z',
  user: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2',
  users: 'M15 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z M3 21v-2a5 5 0 0 1 5-5h7a5 5 0 0 1 5 5v2 M17 5a3.5 3.5 0 0 1 0 7 M21 15a5 5 0 0 1 2 4v2',
  login: 'M10 4H5v16h5 M12 8l4 4-4 4 M8 12h12',
  logout: 'M11 4H5v16h6 M16 8l4 4-4 4 M10 12h10',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  check: 'M5 12l4 4L19 6',
  screen: 'M3 4h18v12H3z M8 21h8 M12 16v5',
  chevron: 'm9 6 6 6-6 6',
  back: 'm15 6-6 6 6 6',
  refresh: 'M20 8a8 8 0 1 0 0 8 M20 3v5h-5',
  sparkle: 'M12 2l2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8z',
  settings: 'M4 6h16 M4 12h16 M4 18h16 M9 4v4 M15 10v4 M10 16v4',
  keyboard: 'M2 5h20v14H2z M6 9h.01 M10 9h.01 M14 9h.01 M18 9h.01 M6 13h.01 M10 13h.01 M14 13h.01 M18 13h.01 M8 16h8',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 16v4h16v-4',
  cloud: 'M5 15a4 4 0 0 1-.5-8 7 7 0 0 1 13-1A4.5 4.5 0 0 1 19 15 M8 17l-1 3 M13 17l-1 3 M18 17l-1 3',
  flag: 'M5 21V3h14l-3 5 3 5H5'
};
export function Icon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name]} /></svg>;
}
export function Mark() {
  return <svg width="37" height="37" viewBox="0 0 37 37" aria-hidden="true">
    <rect width="37" height="37" rx="9" fill="#104e47"/>
    <path d="M9 17.5v-7h7m5 0h7v7m0 3v7h-7m-5 0H9v-7" stroke="#bce7d9" strokeWidth="1.7" fill="none" strokeLinecap="round"/>
    <path d="M14 16h9v5h-9z" fill="#fff" /><path d="M18.5 20v4" stroke="#fff" strokeWidth="1.4"/>
  </svg>;
}
export const format = (value, digits = 1) => value == null ? '—' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: digits }).format(value);
export const dateFormat = value => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export const minutes = seconds => !seconds ? '0 dk' : seconds < 60 ? seconds + ' sn' : format(seconds / 60) + ' dk';
export const charLabel = key => key === ' ' ? 'Boşluk' : key;
export const clock = seconds => Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');

export async function api(path, body, method = 'GET', signal) {
  const response = await fetch('/api' + path, {
    method, signal,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Sunucu yanıtı okunamadı.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'İşlem tamamlanamadı.');
    error.status = response.status;
    throw error;
  }
  return data;
}
export function useApi(path, poll = 0) {
  const [request, setRequest] = useState({ path: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) return undefined;
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const data = await api(path, undefined, 'GET', controller.signal);
        if (!controller.signal.aborted) setRequest({ path, revision, data });
      } catch (error) {
        if (!controller.signal.aborted) setRequest(previous => ({ path, revision, error,
          data: previous.path === path ? previous.data : undefined }));
      } finally { pending = false; }
    }
    void load();
    const timer = poll ? setInterval(load, poll) : null;
    return () => { controller.abort(); clearInterval(timer); };
  }, [path, revision, poll]);
  const fresh = path && path === request.path && revision === request.revision;
  return { data: fresh ? request.data : null, error: fresh ? request.error : null,
    loading: Boolean(path && !fresh), retry: () => setRevision(value => value + 1) };
}

export function Status({ request }) {
  if (request.loading) return <p className="notice" role="status">Bilgiler yükleniyor…</p>;
  if (request.error) return <div className="notice error" role="alert">{request.error.message}
    <button className="button quiet" onClick={request.retry}>Yeniden dene</button></div>;
  return null;
}

export function LayoutSwitch({ layout, onChange, disabled = false }) {
  return <div className="segmented" role="group" aria-label="Klavye düzeni">
    {['F', 'Q'].map(item => <button disabled={disabled} key={item} type="button" aria-pressed={item === layout}
      onClick={() => onChange(item)}><span className="letter">{item}</span> Türkçe {item}</button>)}
  </div>;
}

export function Metrics({ items, compact = false }) {
  return <dl className={'metrics' + (compact ? ' compact' : '')}>{items.map(([label, value, unit]) =>
    <div key={label}><dt>{label}</dt><dd>{value}{unit && <span>{unit}</span>}</dd></div>)}</dl>;
}

export function ReportButtons({ path }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function download(format) {
    setBusy(format);
    setError(null);
    try {
      const response = await fetch('/api' + path + (path.includes('?') ? '&' : '?') + 'format=' + format);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Rapor indirilemedi.');
      }
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const filename = encoded ? decodeURIComponent(encoded) : disposition.match(/filename="([^"]+)"/i)?.[1];
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? 'sinif-sonuclari.' + format;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch (error) { setError(error.message); }
    finally { setBusy(null); }
  }

  return <div className="report-downloads">
    <div className="button-group" role="group" aria-label="Rapor indir">
      {[['pdf', 'PDF'], ['xlsx', 'Excel']].map(([format, label]) => <button type="button" className="button" key={format}
        disabled={Boolean(busy)} onClick={() => download(format)}><Icon name="download" size={16}/>
        {busy === format ? 'Hazırlanıyor…' : label + ' indir'}</button>)}
    </div>
    {error && <p className="small report-error" role="alert">{error}</p>}
  </div>;
}
