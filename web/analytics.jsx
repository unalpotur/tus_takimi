import { useEffect, useRef, useState } from 'react';
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip } from 'chart.js';
import { Keyboard } from './keyboard.jsx';
import { DeleteStudentButton } from './accounts.jsx';
import { charLabel, dateFormat, format, Icon, Metrics, minutes, ReportButtons, Status, useApi } from './ui.jsx';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip);
const typeLabels = { placement_test: 'Seviye sınavı', class_exam: 'Sınıf sınavı', lesson: 'Alıştırma', game: 'Oyun' };
const details = pair => charLabel(pair.expected_char) + ' → ' + charLabel(pair.pressed_char) + ' × ' + pair.error_count;

function ErrorList({ errors, count }) {
  if (!errors.length) return <span className="muted">—</span>;
  return <details className="pair-list"><summary>{count} hata</summary>
    <ul>{errors.map((pair, index) => <li key={index}>{details(pair)}</li>)}</ul>
  </details>;
}
export function History({ history }) {
  return <section className="panel history">
    <div className="panel-head"><h2>Çalışma geçmişi</h2></div>
    {history.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Çalışma geçmişi tablosu"><table>
      <thead><tr><th scope="col">Çalışma</th><th scope="col">Tarih</th><th scope="col" className="numeric">Süre</th>
        <th scope="col" className="numeric">Net vuruş</th><th scope="col" className="numeric">WPM</th>
        <th scope="col" className="numeric">Doğruluk</th><th scope="col">Yanlış karakterler</th></tr></thead>
      <tbody>{history.map(row => <tr key={row.id}>
        <th scope="row">{row.title}<small>{typeLabels[row.activity_type]}</small></th><td>{dateFormat(row.created_at)}</td>
        <td className="numeric">{minutes(row.duration_seconds)}</td><td className="numeric">{row.net_characters}</td>
        <td className="numeric">{format(row.wpm)}</td><td className="numeric">%{format(row.accuracy)}</td>
        <td><ErrorList errors={row.errors} count={row.error_count}/></td>
      </tr>)}</tbody>
    </table></div> : <p className="panel-empty">Bu klavye düzeniyle tamamlanan çalışma yok.</p>}
  </section>;
}
function Trend({ history }) {
  const canvas = useRef(null);
  useEffect(() => {
    if (!history.length) return undefined;
    const data = [...history].reverse();
    const labels = data.map(item => dateFormat(item.created_at));
    const chart = new Chart(canvas.current, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Net hız (WPM)', data: data.map(item => item.wpm), borderColor: '#1b6e66', backgroundColor: '#1b6e66', yAxisID: 'wpm', borderWidth: 2, pointRadius: data.length === 1 ? 4 : 2 },
        { label: 'Doğruluk (%)', data: data.map(item => item.accuracy), borderColor: '#555f5b', backgroundColor: '#555f5b', borderDash: [5, 4], yAxisID: 'accuracy', borderWidth: 2, pointRadius: data.length === 1 ? 4 : 2 }
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 4, callback: index => labels[index].split(' ').slice(0, 3).join(' ') } },
          wpm: { type: 'linear', position: 'left', beginAtZero: true, ticks: { maxTicksLimit: 5 }, grid: { color: '#dfe6e3' } },
          accuracy: { type: 'linear', position: 'right', min: 0, max: 100, ticks: { stepSize: 25, callback: value => value + '%' }, grid: { display: false } }
        }
      }
    });
    return () => chart.destroy();
  }, [history]);
  return <section className="panel">
    <div className="panel-head between"><h2>Gelişim grafiği</h2>{history.length > 0 && <div className="chart-legend" aria-hidden="true">
      <span>Net hız</span><span>Doğruluk</span></div>}</div>
    {history.length ? <div className="chart"><canvas ref={canvas} role="img" aria-label="Net hız ve doğruluk gelişimi. Değerler çalışma geçmişi tablosunda listeleniyor."/></div> :
      <p className="panel-empty">İlk çalışma tamamlandığında gelişim burada görünecek.</p>}
  </section>;
}

export function Progress({ layout, revision }) {
  const request = useApi('/results?layout=' + layout + '&refresh=' + revision);
  const data = request.data;
  return <><Status request={request}/>
    {data && <>
      <Metrics items={[[ 'Tamamlanan çalışma', data.summary.count ], ['Ort. net hız', format(data.summary.wpm), 'WPM'],
        ['Ort. doğruluk', data.summary.accuracy == null ? '—' : '%' + format(data.summary.accuracy)], ['Çalışma süresi', minutes(data.summary.seconds)]]}/>
      <Trend history={data.history}/>
      <History history={data.history}/>
    </>}
  </>;
}

const overviewPath = selection => '/admin/overview?' + new URLSearchParams(selection);
const detailPath = selection => '/admin/student/' + selection.id + '?' +
  new URLSearchParams({ year: selection.year, class: selection.class, layout: selection.layout });

function Student({ selection, onBack, onDeleted }) {
  const [layout, setLayout] = useState(selection.layout);
  const request = useApi(detailPath({ ...selection, layout }));
  const data = request.data;
  const heatmap = data?.heatmap.filter(key => key.errors) ?? [];
  return <>
    <div className="page-title between student-detail-title"><div><button className="button quiet back-button" onClick={onBack}><Icon name="back" size={16}/> Sınıfa dön</button>
      <h1>{selection.name}</h1><p>{selection.year} · {selection.class}</p></div>
      <label className="filter">Klavye düzeni<select value={layout} onChange={event => setLayout(event.target.value)} aria-label="Klavye düzeni">
        <option value="F">Türkçe F</option><option value="Q">Türkçe Q</option></select></label>
    </div>
    <Status request={request}/>
    {data && <>
      <Trend history={data.history}/>
      <section className="panel">
        <div className="panel-head"><h2>Klavye ısı haritası</h2><p className="muted small">Kırmızı koyulaştıkça tuştaki hata sayısı artar.</p></div>
        <Keyboard layout={data.layout} heatmap={heatmap} home={false}/>
        {heatmap.length > 0 ? <p className="panel-note">{heatmap.slice(0, 6).map(key => charLabel(key.expected_char) + ' · ' + key.errors + ' hata').join(' / ')}</p> :
          <p className="panel-note">Bu seçimde hata kaydı yok.</p>}
      </section>
      <History history={data.history}/>
      <section className="panel student-account-actions between">
        <div><h2>Öğrenci hesabı</h2><p className="muted small">Hesap ve öğrenciye ait sonuçlar kalıcı olarak silinir.</p></div>
        <DeleteStudentButton id={selection.id} name={selection.name} onDeleted={onDeleted}/>
      </section>
    </>}
  </>;
}

export function Admin() {
  const [selection, setSelection] = useState({});
  const [student, setStudent] = useState(null);
  const [removed, setRemoved] = useState(null);
  const request = useApi(overviewPath(selection));
  const data = request.data;
  const groups = data?.groups ?? [];
  const years = [...new Set(groups.map(item => item.year))];
  const activeYear = data?.year ?? selection.year ?? '';
  const activeClass = data?.class ?? selection.class ?? '';
  const classes = groups.filter(item => item.year === activeYear).map(item => item.class);
  if (student) return <Student selection={student} onBack={() => setStudent(null)} onDeleted={() => {
    setRemoved(student.name);
    setStudent(null);
    if (data?.rows.every(row => row.id === student.id)) {
      setSelection(classes.some(className => className !== student.class) ? { year: student.year } : {});
    }
    request.retry();
  }}/>;
  return <>
    <div className="page-title between"><div><h1>Sınıf takibi</h1><p>Yazım hızı, doğruluk ve öğrenci gelişimi</p></div>
      <button className="button" onClick={request.retry} disabled={request.loading}><Icon name="refresh"/> Yenile</button></div>
    {data && <div className="filter-bar">
      <label className="filter">Öğrenim yılı<select aria-label="Öğrenim yılı" value={activeYear} disabled={!years.length}
        onChange={event => setSelection({ year: event.target.value })}>
        {!years.length && <option value="">Öğrenim yılı yok</option>}{years.map(year => <option key={year}>{year}</option>)}</select></label>
      <label className="filter">Sınıf<select aria-label="Sınıf" value={activeClass} disabled={!classes.length}
        onChange={event => setSelection({ year: activeYear, class: event.target.value })}>
        {!classes.length && <option value="">Sınıf yok</option>}{classes.map(className => <option key={className}>{className}</option>)}</select></label>
    </div>}
    <Status request={request}/>
    {removed && <p className="notice success" role="status">{removed} silindi.</p>}
    {data && <>
      <Metrics items={[[ 'Öğrenci', new Set(data.rows.map(row => row.id)).size ], ['Sınıf ort. hızı', format(data.summary.wpm), 'WPM'],
        ['Ort. doğruluk', data.summary.accuracy == null ? '—' : '%' + format(data.summary.accuracy)], ['Ortak hata tuşları',
          data.errors.length ? data.errors.slice(0, 3).map(key => charLabel(key.expected_char)).join(' · ') : '—' ]]}/>
      <section className="panel">
        <div className="panel-head between report-heading"><div><h2>Öğrenciler</h2>{activeClass && <p className="muted small">{activeYear} · {activeClass}</p>}</div>
          {classes.includes(activeClass) && <ReportButtons key={activeYear + activeClass}
            path={'/admin/overview/export?' + new URLSearchParams({ year: activeYear, class: activeClass })}/>}</div>
        {data.rows.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Öğrenci performans tablosu"><table>
          <thead><tr><th scope="col">Öğrenci</th><th scope="col">Düzen</th><th scope="col" className="numeric">Seviye</th>
            <th scope="col" className="numeric">Ort. WPM</th><th scope="col" className="numeric">Doğruluk</th>
            <th scope="col" className="numeric">Son sınav puanı</th><th scope="col" className="numeric">Çalışma süresi</th></tr></thead>
          <tbody>{data.rows.map(row => <tr className="student-row" key={row.id + row.keyboard_layout}
            onClick={() => { setRemoved(null); setStudent({ id: row.id, name: row.full_name, year: activeYear, class: activeClass, layout: row.keyboard_layout }); }}>
            <th scope="row"><button className="student-link">
              {row.full_name}<Icon name="chevron" size={16}/></button><small>{row.username}</small></th>
            <td>Türkçe {row.keyboard_layout}</td><td className="numeric">{row.level}</td><td className="numeric">{format(row.wpm)}</td>
            <td className="numeric">{row.accuracy == null ? '—' : '%' + format(row.accuracy)}</td><td className="numeric">{row.score ?? '—'}</td>
            <td className="numeric">{minutes(row.seconds)}</td>
          </tr>)}</tbody>
        </table></div> : <p className="panel-empty">Bir öğrenci hesabı oluşturulduğunda sınıf listesi burada görünecek.</p>}
      </section>
    </>}
  </>;
}
