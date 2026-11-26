import { useState } from 'react';
import { DeleteStudentButton } from './accounts.jsx';
import { Status, useApi } from './ui.jsx';

const collator = new Intl.Collator('tr', { numeric: true });
const statusLabels = { approved: 'Onaylı', pending: 'Onay bekliyor' };
const searchText = value => value.normalize('NFC').toLocaleLowerCase('tr');

export function StudentList() {
  const request = useApi('/teacher/students');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('');
  const [className, setClassName] = useState('');
  const [status, setStatus] = useState('');
  const [removed, setRemoved] = useState([]);
  const [feedback, setFeedback] = useState('');

  const students = request.data?.students ?? [];
  const years = [...new Set(students.map(student => student.academic_year).filter(Boolean))].sort().reverse();
  const classes = [...new Set(students.filter(student => !year || student.academic_year === year)
    .map(student => student.class_name).filter(Boolean))].sort(collator.compare);
  const term = searchText(search.trim());
  const visible = students.filter(student => !removed.includes(student.id)
    && (!year || student.academic_year === year)
    && (!className || student.class_name === className)
    && (!status || student.approval_status === status)
    && (!term || searchText(student.full_name).includes(term) || searchText(student.username).includes(term)))
    .sort((a, b) => collator.compare(a.full_name, b.full_name) || collator.compare(a.username, b.username));
  const filtered = Boolean(term || year || className || status);

  function clearFilters() {
    setSearch('');
    setYear('');
    setClassName('');
    setStatus('');
  }

  return <>
    <div className="page-title"><h1>Öğrenci listesi</h1></div>
    <Status request={request}/>
    {feedback && <p className="notice success" role="status">{feedback}</p>}
    {request.data && <section className="panel" aria-label="Öğrenci hesapları">
      <div className="filter-bar student-filters" role="group" aria-label="Öğrenci filtreleri">
        <label className="filter">Öğrenci ara<input type="search" placeholder="Ad soyad veya kullanıcı adı"
          value={search} onChange={event => setSearch(event.target.value)}/></label>
        <div className="filter"><label htmlFor="student-year">Öğrenim yılı</label><select id="student-year" value={year} onChange={event => {
          setYear(event.target.value);
          setClassName('');
        }}>
          <option value="">Tüm yıllar</option>
          {years.map(item => <option key={item}>{item}</option>)}
        </select></div>
        <div className="filter"><label htmlFor="student-class">Sınıf</label><select id="student-class" value={className} onChange={event => setClassName(event.target.value)}>
          <option value="">Tüm sınıflar</option>
          {classes.map(item => <option key={item}>{item}</option>)}
        </select></div>
        <div className="filter"><label htmlFor="student-status">Hesap durumu</label><select id="student-status" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">Tüm durumlar</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></div>
      </div>
      <div className="panel-head between student-list-summary">
        <span className="small muted" role="status">{visible.length} öğrenci</span>
        <button className="button quiet" type="button" onClick={clearFilters} disabled={!filtered}>Filtreleri temizle</button>
      </div>
      {visible.length ? <div className="table-wrap student-list" role="region" aria-label="Öğrenci tablosu" tabIndex={0}><table>
        <thead><tr><th scope="col">Öğrenci</th><th scope="col" className="student-enrollment">Öğrenim yılı</th>
          <th scope="col" className="student-enrollment">Sınıf</th><th scope="col">Durum</th><th scope="col" className="numeric">İşlem</th></tr></thead>
        <tbody>{visible.map(student => <tr key={student.id}>
          <th scope="row">{student.full_name}<small>{student.username}</small>
            <small className="student-mobile-enrollment">{[student.academic_year, student.class_name].filter(Boolean).join(' · ')}</small></th>
          <td className="student-enrollment">{student.academic_year || '—'}</td>
          <td className="student-enrollment">{student.class_name || '—'}</td>
          <td>{statusLabels[student.approval_status] ?? '—'}</td>
          <td className="numeric"><DeleteStudentButton id={student.id} name={student.full_name} compact onDeleted={() => {
            setRemoved(previous => [...previous, student.id]);
            setFeedback(student.full_name + ' silindi.');
          }}/></td>
        </tr>)}</tbody>
      </table></div> : <p className="panel-empty">{filtered ? 'Filtrelere uyan öğrenci bulunamadı.' : 'Henüz öğrenci hesabı yok.'}</p>}
    </section>}
  </>;
}
