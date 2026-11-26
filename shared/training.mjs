export const layouts = ['F', 'Q'];
const plainLetters = { â: 'a', Â: 'A', î: 'i', Î: 'İ', û: 'u', Û: 'U' };
export const withoutCircumflex = char => plainLetters[char] ?? char;
export const matchesCharacter = (expected, pressed) => expected === pressed || withoutCircumflex(expected) === pressed;
export const examDurations = [60, 300, 600, 900, 1200];

export function currentYear() {
  const today = new Date();
  const year = today.getFullYear() - Number(today.getMonth() < 8);
  return year + '-' + (year + 1);
}
export const levels = [
  { title: 'Temel sıra', detail: 'Ana sırada iki ve üç harfli diziler', wpm: 0, accuracy: 0 },
  { title: 'Üst ve alt sıra', detail: 'Tüm harfler ve kısa kelimeler', wpm: 16, accuracy: 85 },
  { title: 'Cümle pratiği', detail: 'Anlamlı cümleler ve büyük harfler', wpm: 31, accuracy: 90 },
  { title: 'İşaretler ve sayılar', detail: 'Rakamlar, tırnaklar ve noktalama', wpm: 46, accuracy: 93 },
  { title: 'Hız ve akıcılık', detail: 'Uzun metinler ve profesyonel yazım', wpm: 66, accuracy: 96 }
];

export const examTargetWpm = level => Math.max(10, levels[level - 1].wpm);

export function examScore(wpm, accuracy, level) {
  if (wpm == null || accuracy == null || level == null) return null;
  return Math.round(Math.min(1, wpm / examTargetWpm(level)) * accuracy);
}

export const passages = [
  'Yeni bir beceri öğrenmek sabır ve düzenli çalışma ister. Ellerini klavyenin temel sırasına yerleştir ve her harfe doğru parmakla ulaş. İlk denemede yavaş yazmak doğaldır. Kısa cümleleri dikkatle yazdıkça ritmini bulursun. Düzenli tekrar, tuşların yerini düşünmeden yazabilmeni sağlar.',
  'Sabah okula vardığımızda bahçede hafif bir rüzgâr esiyordu. Kütüphanenin kapısında arkadaşlarımla buluştum. Masanın üzerine üç kitap ve küçük bir defter bıraktık. Öğretmenimiz, metni önce sessizce okumamızı, ardından kendi kelimelerimizle anlatmamızı istedi.',
  'Bir işi öğrenirken küçük adımlar büyük fark yaratır. Bugün kendine ulaşılabilir bir hedef koy ve birkaç dakika boyunca yalnızca doğruluğa odaklan. Sonunda nerede zorlandığını gözden geçir. Yarın aynı çalışmayı daha rahat tamamladığını fark edebilirsin.'
];
const foundation = {
  F: ['ak al el ek ay il kal ela kel mal', 'ay al ak ek el il kil kim kay lak'],
  Q: ['as ad af al ak aş dal sal kal kaş', 'al as ad af ak aş las fal kas dal']
};
const allLetters = [
  'çiçek yağmur gölge küçük yıldız pencere özgür şaşkın rüzgâr müzik sahil deniz',
  'bavul ceket fırın huzur jilet kâğıt lamba mektup neşe orman piknik vazo yelken zarf'
];
const punctuation = [
  'Saat 09.30’da (2. katta) buluşalım. Liste: 3 kalem, 2 dosya ve 1 defter. “Hazır mıyız?” diye sordu.',
  'Not: 12/05/2026 tarihinde 4 kitap teslim edildi; 2 kitap daha bekleniyor. (Raf: B-7) Unutma!'
].map(text => text.replaceAll('’', "'").replace(/[“”]/g, '"'));
const wordBank = [
  ...allLetters.join(' ').split(' '),
  'başlangıç', 'sağlık', 'güneş', 'soğuk', 'ışık', 'giriş', 'düşünce', 'şehir', 'ağaç', 'öğrenci',
  'kalem', 'martı', 'kitap', 'yazı', 'masa', 'teneffüs', 'aşama', 'köprü', 'öğle', 'ışıldak',
  'çalışma', 'şarkı', 'parmak', 'klavye', 'ulaşım', 'yardım', 'zaman', 'rüya', 'serçe', 'hedef'
];

const content = layout => [
  foundation[layout].map(line => line + ' ' + line),
  allLetters.map(line => line + ' ' + line),
  passages.map(line => line.split('. ').slice(0, 2).join('. ') + '.'),
  punctuation,
  [passages[2] + ' ' + punctuation[1], passages[1] + ' ' + punctuation[0]]
];

export function lessonsFor(layout) {
  return levels.flatMap((level, index) => content(layout)[index].map((text, part) => ({
    id: 'lesson-' + (index + 1) + '-' + (part + 1),
    level: index + 1,
    title: level.title + ' · ' + (part + 1),
    type: 'lesson', duration: 0, text
  })));
}

export function makeClassExamText(level, duration) {
  const text = level === 1 ? 'ak al la kal lak ala ka ala kal lak al ak' :
    lessonsFor('F').filter(lesson => lesson.level === level).map(lesson => lesson.text).join(' ');
  return Array.from({ length: Math.ceil(duration * 22 / (text.length + 1)) }, () => text).join(' ');
}

export const preview = layout => ({ ...lessonsFor(layout)[0], id: 'preview', title: 'Temel sıra ısınması' });
export const skillGames = [
  { id: 'rain', title: 'Kelime yağmuru', detail: 'Düşen kelimeleri yere ulaşmadan bitir.', duration: 45 },
  { id: 'race', title: 'Hız yarışı', detail: 'Doğru kelimelerle aracını finiş çizgisine yaklaştır.', duration: 45 }
];

export function makeActivity(id, layout, pick, weaknesses = [], examDuration = 60) {
  if (id === 'placement') {
    const offset = pick(passages.length);
    const text = Array.from({ length: 6 + examDuration / 30 }, (_, i) => passages[(i + offset) % passages.length]).join(' ');
    return { id, title: 'Seviye sınavı', type: 'placement_test', duration: examDuration, text };
  }
  if (id === 'weakness') {
    const chars = weaknesses.map(x => x.expected_char).filter(c => c.trim()).slice(0, 4);
    if (!chars.length) return null;
    const chunks = chars.map(c => {
      const matching = wordBank.filter(word => word.includes(c.toLocaleLowerCase('tr')));
      if (matching.length && c === c.toLocaleLowerCase('tr')) {
        return Array.from({ length: 5 }, () => matching[pick(matching.length)]).join(' ');
      }
      return Array.from({ length: 5 }, () => c + c).join(' ');
    });
    return { id, title: 'Hata odaklı çalışma', type: 'lesson', duration: 0, text: chunks.join(' ') };
  }
  const game = skillGames.find(item => item.id === id);
  if (game) {
    const words = Array.from({ length: id === 'race' ? 24 : 90 }, () => wordBank[pick(wordBank.length)]);
    return { ...game, type: 'game', words, text: words.join(' ') };
  }
  return lessonsFor(layout).find(item => item.id === id);
}

export function levelFor(wpm, accuracy) {
  return levels.reduce((attained, level, index) =>
    wpm >= level.wpm && accuracy >= level.accuracy ? index + 1 : attained, 1);
}

export function createRun(activity) {
  const rain = activity.id === 'rain';
  const track = rain ? activity.words[0] : activity.text;
  return {
    activity, track, typed: [], events: [], total: 0, correctHits: 0, net: 0,
    incorrect: 0, stats: new Map(), word: 0, missed: 0, wordStart: 0
  };
}

export function record(run, key, ms) {
  if (key === 'Backspace') {
    const previous = run.typed.pop();
    if (previous === undefined) return false;
    if (matchesCharacter(run.track[run.typed.length], previous)) run.net--;
    else run.incorrect--;
  } else {
    const expected = run.track[run.typed.length];
    if (expected === undefined) return false;
    const error = !matchesCharacter(expected, key);
    run.total++;
    run.typed.push(key);
    if (error) run.incorrect++;
    else {
      run.correctHits++;
      run.net++;
    }
    const pair = JSON.stringify([expected, key]);
    const stat = run.stats.get(pair) ?? { expected_char: expected, pressed_char: key, error_count: 0, total_hits: 0 };
    stat.total_hits++;
    stat.error_count += Number(error);
    run.stats.set(pair, stat);
  }
  run.events.push([ms, key]);
  if (run.activity.id === 'rain' && run.typed.length === run.track.length &&
      run.typed.every((char, index) => matchesCharacter(run.track[index], char))) {
    advanceRain(run, ms);
  }
  return true;
}

export const rainLimit = 4200;
function advanceRain(run, ms) {
  run.word++;
  run.track = run.activity.words[run.word] ?? '';
  run.typed = [];
  run.wordStart = ms;
}
export function expireRain(run, ms) {
  while (run.activity.id === 'rain' && run.track && ms - run.wordStart >= rainLimit) {
    run.missed++;
    run.net -= run.typed.filter((key, index) => matchesCharacter(run.track[index], key)).length;
    advanceRain(run, run.wordStart + rainLimit);
  }
}

export function complete(run) {
  const { activity, track, typed } = run;
  if (activity.id === 'rain') return !track;
  if (activity.type === 'placement_test' || activity.type === 'class_exam') return false;
  return typed.length === track.length && (activity.id !== 'race' || run.incorrect === 0);
}

const round = n => Math.round(n * 10) / 10;
export function score(run, ms) {
  const seconds = Math.max(1, ms / 1000);
  return {
    wpm: round(Math.max(0, (run.net / 5 - run.incorrect) * 60 / seconds)),
    cpm: round(run.net * 60 / seconds),
    accuracy: run.total ? round(run.correctHits * 100 / run.total) : 0,
    net_characters: run.net,
    error_count: run.total - run.correctHits,
    duration_seconds: Math.round(seconds)
  };
}

export function replay(activity, events, ms) {
  if (!Number.isInteger(ms) || ms < 0 || ms > 1_800_000 || !Array.isArray(events) || events.length > 48000) return null;
  const limit = activity.duration * 1000;
  if (limit && ms > limit) return null;
  const run = createRun(activity);
  let previous = 0;
  for (const event of events) {
    if (!Array.isArray(event) || event.length !== 2) return null;
    const [time, key] = event;
    if (!Number.isInteger(time) || time < previous || time > ms || (limit && time >= limit) ||
        typeof key !== 'string' || (key !== 'Backspace' && !/^[^\p{C}\p{M}]$/u.test(key))) return null;
    previous = time;
    expireRain(run, time);
    if (complete(run) || !record(run, key, time)) return null;
  }
  expireRain(run, ms);
  if ((!limit || ms < limit) && !complete(run)) return null;
  if (activity.type === 'placement_test' && !run.total) return null;
  return { metrics: score(run, ms), stats: [...run.stats.values()] };
}
