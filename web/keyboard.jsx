import { charLabel } from './ui.jsx';
import { withoutCircumflex } from '../shared/training.mjs';

const punctuation = {
  F: { top: 'fgğıodrnhpqw', home: 'uieaütkmlyşx', bottom: 'jövcçzsb.,', number: '+1234567890/-',
    shiftNumbers: '*!"^$%&\'()=?_', shiftBottom: 'JÖVCÇZSB:;' },
  Q: { top: 'qwertyuıopğü', home: 'asdfghjklşi,', bottom: 'zxcvbnmöç.', number: '"1234567890*-',
    shiftNumbers: 'é!\'^+%&/()=?_', shiftBottom: 'ZXCVBNMÖÇ:' }
};
const fingerNames = ['Sol serçe', 'Sol yüzük', 'Sol orta', 'Sol işaret', 'Sağ işaret', 'Sağ orta', 'Sağ yüzük', 'Sağ serçe', 'Başparmak'];
const fills = ['#e5edf5', '#e8e5f3', '#f7e9dd', '#d5ebe5', '#d5ebe5', '#f7e9dd', '#e8e5f3', '#e5edf5', '#e9eeeb'];
const make = (label, finger, size = 1, shifted, special = false) => ({ label, finger, size, shifted, special, value: label });
const special = (label, size, finger = 8) => make(label, finger, size, null, true);
const fingers = [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7];

function keysFor(layout) {
  const map = punctuation[layout];
  return [
    [...Array.from(map.number, (value, index) => make(value, fingers[Math.max(0, index - 1)] ?? 7, 1, map.shiftNumbers[index])),
      special('Sil', 2, 7)],
    [special('Tab', 1.5, 0), ...Array.from(map.top, (value, index) => make(value, fingers[index])), special('↵', 1.5, 7)],
    [special('Caps', 1.75, 0), ...Array.from(map.home, (value, index) => make(value, fingers[index], 1, value === ',' ? ';' : undefined)), special('Enter', 1.25, 7)],
    [special('Shift', 1.25, 0), make('<', 0, 1, '>'),
      ...Array.from(map.bottom, (value, index) => make(value, fingers[index], 1, /[.,]/.test(value) ? map.shiftBottom[index] : undefined)), special('Shift', 2.75, 7)],
    [special('Ctrl', 1.5), special('Alt', 1.5), { ...make('Boşluk', 8, 9), value: ' ' }, special('Alt Gr', 1.5), special('Ctrl', 1.5)]
  ];
}
function keyMatches(key, char) {
  return char != null && (key.value === char || key.shifted === char ||
    (!key.special && key.value.toLocaleUpperCase('tr') === char) || (key.label === 'Sil' && char === 'Backspace'));
}
export function Keyboard({ layout, expected, pressed, home = true, guide = false, heatmap, onKey }) {
  const stats = new Map();
  for (const item of heatmap ?? []) {
    const key = withoutCircumflex(item.expected_char);
    stats.set(key, (stats.get(key) ?? 0) + item.errors);
  }
  const maxErrors = Math.max(1, ...stats.values());
  const rows = keysFor(layout);
  const targetChar = withoutCircumflex(expected);
  const hasKey = rows.flat().some(key => keyMatches(key, targetChar) && !key.special);
  return <div className="keyboard-wrap">
    <svg className="keyboard" viewBox="0 0 750 248" role="img" aria-label={
      heatmap ? 'Klavye hata ısı haritası' : 'Türkçe ' + layout + ' sanal klavyesi' + (expected ? ', sıradaki tuş ' + charLabel(expected) : '')}>
      {rows.map((row, rowIndex) => {
        let x = 0;
        return <g key={rowIndex}>{row.map((key, index) => {
          const left = x;
          x += key.size * 50;
          const top = rowIndex * 50;
          const target = keyMatches(key, targetChar) && !key.special;
          const physical = keyMatches(key, pressed);
          const isHome = home && rowIndex === 2 && (index >= 1 && index <= 4 || index >= 7 && index <= 10);
          const related = [key.value, key.value.toLocaleUpperCase('tr'), key.shifted].filter(Boolean);
          const count = key.special ? 0 : [...new Set(related)].reduce((sum, char) => sum + (stats.get(char) ?? 0), 0);
          const baseFill = guide || isHome ? fills[key.finger] : '#ffffff';
          const fill = count ? '#fbd5d0' : target || physical ? '#155a50' : baseFill;
          const clickable = onKey && (!key.special || key.label === 'Sil');
          return <g key={index} className={clickable ? 'virtual-key' : undefined} onPointerDown={clickable ? event => event.preventDefault() : undefined}
            onClick={clickable ? () => onKey(key.label === 'Sil' ? 'Backspace' : target ? targetChar : key.value) : undefined}>
            <title>{key.label}{key.special ? '' : ' · ' + fingerNames[key.finger]}{heatmap ? ' · ' + count + ' hata' : ''}</title>
            <rect x={left + 3} y={top + 3} width={key.size * 50 - 6} height="43" rx="6" fill={fill}
              stroke={target || physical ? '#104e47' : '#cbd4d0'} strokeWidth={target ? 2 : 1}/>
            {count > 0 && <rect x={left + 3} y={top + 3} width={key.size * 50 - 6} height="43" rx="6" fill="#be3c31" opacity={.12 + .48 * count / maxErrors}/>}
            {key.shifted && <text x={left + 8} y={top + 15} fill={target || physical ? '#fff' : '#4d5e57'} fontSize="9">{key.shifted}</text>}
            <text x={left + key.size * 25} y={top + 30} textAnchor="middle" fill={(target || physical) && !count ? '#ffffff' : '#172d26'}
              fontSize={key.special || key.value === ' ' ? 12 : 17}>{key.special ? key.label : key.label.toLocaleUpperCase('tr')}</text>
            {isHome && (index === 4 || index === 7) && !count && <path d={'M' + (left + 20) + ' ' + (top + 39) + 'h10'} stroke={target || physical ? '#c4eadd' : '#51736a'} strokeWidth="2" strokeLinecap="round"/>}
          </g>;
        })}</g>;
      })}
    </svg>
    {guide && <div className="finger-legend">
      {fingerNames.map((finger, index) => <span key={finger}><i style={{ background: fills[index] }}/>{finger}</span>)}
    </div>}
    {expected && !hasKey && <p className="muted small">Sıradaki karakter <strong>{charLabel(expected)}</strong>. Gerekirse Shift veya Alt Gr kullan.</p>}
  </div>;
}

function Hand({ reverse }) {
  return <g transform={reverse ? 'translate(354 0) scale(-1 1)' : undefined}>
    <path d="M53 163c-13-8-21-20-26-35l-9-25c-3-10 8-16 14-8l10 14-8-49c-2-12 10-15 13-4l8 35-1-59c0-12 14-13 15-1l3 56 6-68c1-13 16-11 16 1l-3 67 15-52c3-12 17-8 15 3l-11 59 18-14c10-8 20 3 11 13l-19 21c-8 9-8 32-26 46l-8 11H62z"
      fill="#d8eae4" fillOpacity=".65" stroke="#6f9689" strokeWidth="1.5"/>
    {[[40,57,0],[62,30,1],[86,19,2],[114,37,3],[133,89,8]].map(([x,y,f]) =>
      <circle key={f} cx={x} cy={y} r="6.5" fill={fills[f]} stroke="#547c6f"/>)}
  </g>;
}
export function Hands() {
  return <svg className="hands" viewBox="0 0 354 185" role="img" aria-label="Sol ve sağ elin temel sıra parmak konumları">
    <Hand/><Hand reverse/>
  </svg>;
}
