import PdfPrinter from 'pdfmake';
import fonts from 'pdfmake/build/vfs_fonts.js';
import ExcelJS from 'exceljs';
import { examTargetWpm, levels } from '../shared/training.mjs';

const ink = '#182720';
const accent = '#15594f';
const rule = '#dce4df';
const secondary = '#53635b';
const headingFill = '#e8f2ee';
const number = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
const scoreRule = 'Puan = yuvarla(min(net WPM / hedef WPM, 1) × doğruluk yüzdesi).';
const statusText = { pending: 'Başlamadı', started: 'Başladı', awaiting_submission: 'Teslim bekleniyor',
  completed: 'Tamamlandı', expired: 'Kayıt süresi doldu' };

const student = { title: 'Öğrenci', width: 29, pdf: '*'};
const username = { title: 'Kullanıcı adı', width: 17, pdf: 88 };
const keyboard = { title: 'Düzen', width: 11, pdf: 44 };
const wpm = { title: 'Net WPM', width: 12, pdf: 57, kind: 'decimal' };
const accuracy = { title: 'Doğruluk', width: 12, pdf: 56, kind: 'percent' };
const score = { title: 'Puan / 100', width: 14, pdf: 64, kind: 'integer', score: true };

export function overviewReport(data) {
  const targets = levels.map((_, index) => examTargetWpm(index + 1)).join(', ');
  return {
    filename: 'sinif-sonuclari-' + data.year + '-' + data.class,
    title: 'Sınıf sonuçları',
    subtitle: data.year + '  ·  ' + data.class + '  ·  ' + new Set(data.rows.map(row => row.id)).size + ' öğrenci',
    note: 'Puan, ilgili klavye düzeniyle tamamlanan en son sınıf sınavına aittir. ' +
      scoreRule + ' Seviye 1–5 hız hedefleri (WPM): ' + targets + '.',
    columns: [student, username, keyboard, { title: 'Mevcut seviye', width: 15, pdf: 72, kind: 'integer' },
      { ...wpm, title: 'Ort. WPM' }, { ...accuracy, title: 'Ort. doğruluk', width: 16, pdf: 75 }, score,
      { title: 'Çalışma (sn)', width: 15, pdf: 66, kind: 'integer' }],
    rows: data.rows.map(row => [row.full_name, row.username, row.keyboard_layout, row.level, row.wpm,
      row.accuracy, row.score, row.seconds])
  };
}

export function examReport({ exam, rows }) {
  const completed = rows.filter(row => row.status === 'completed').length;
  return {
    filename: 'sinav-sonuclari-' + exam.class_name + '-' + exam.created_at.slice(0, 10) + '-' + exam.id.slice(0, 8),
    title: 'Sınıf sınavı sonuçları',
    subtitle: [exam.academic_year, exam.class_name, 'Seviye ' + exam.level, exam.duration_seconds / 60 + ' dk',
      completed + ' / ' + rows.length + ' teslim', dateTime.format(new Date(exam.created_at))].join('  ·  '),
    note: 'Seviye ' + exam.level + ' hız hedefi ' + examTargetWpm(exam.level) + ' WPM. ' + scoreRule,
    columns: [student, { ...username, pdf: 70 }, { title: 'Durum', width: 20, pdf: 86 }, { ...keyboard, pdf: 32 }, wpm, accuracy, score,
      { title: 'Net vuruş', width: 12, pdf: 50, kind: 'integer' },
      { title: 'Hata', width: 8, pdf: 35, kind: 'integer' },
      { title: 'Teslim zamanı', width: 22, pdf: 108, kind: 'date' }],
    rows: rows.map(row => [row.full_name, row.username, statusText[row.status], row.keyboard_layout, row.wpm,
      row.accuracy, row.score, row.net_characters, row.error_count, row.created_at])
  };
}

function pdfCell(value, column) {
  const numeric = column.kind && column.kind !== 'date';
  const text = value == null ? '—' : column.kind === 'date' ? dateTime.format(new Date(value)) :
    column.kind === 'percent' ? '%' + number.format(value) : numeric ? number.format(value) : value;
  return { text, alignment: numeric ? 'right' : 'left', bold: Boolean(column.score),
    color: value == null ? secondary : column.score ? accent : ink };
}

const font = filename => Buffer.from(fonts[filename], 'base64');
const printer = new PdfPrinter({ Roboto: {
  normal: font('Roboto-Regular.ttf'), bold: font('Roboto-Medium.ttf')
}});

async function makePdf(report) {
  const { title, subtitle, note, rows, columns } = report;
  const body = [columns.map(column => ({ text: column.title, bold: true, color: accent }))];
  for (const row of rows) body.push(row.map((value, index) => pdfCell(value, columns[index])));
  if (!rows.length) body.push([{ text: 'Bu seçim için öğrenci kaydı yok.', colSpan: columns.length }, ...columns.slice(1).map(() => ({}))]);
  const doc = printer.createPdfKitDocument({
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [34, 34, 34, 40],
    info: { title, author: 'Tuş Atölyesi' },
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: ink },
    footer: (current, count) => ({ margin: [34, 10, 34, 0], fontSize: 8, color: secondary,
      columns: [{ text: 'Tuş Atölyesi · ' + title }, { text: current + ' / ' + count, alignment: 'right' }] }),
    content: [
      { text: title, fontSize: 22, bold: true, color: accent, margin: [0, 0, 0, 5] },
      { text: subtitle, fontSize: 11, color: secondary, margin: [0, 0, 0, 13] },
      { text: note, fontSize: 9, color: secondary, margin: [0, 0, 0, 13] },
      {
        table: { headerRows: 1, dontBreakRows: true, widths: columns.map(column => column.pdf), body },
        layout: {
          fillColor: index => index === 0 ? headingFill : null,
          hLineWidth: () => .5, hLineColor: () => rule, vLineWidth: () => 0,
          paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 6, paddingBottom: () => 6
        }
      }
    ]
  });
  return await new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function excelValue(value, column) {
  if (value == null) return null;
  if (column.kind === 'percent') return value / 100;
  if (column.kind !== 'date') return value;
  const date = new Date(value);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()));
}

async function makeExcel(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tuş Atölyesi';
  const sheet = workbook.addWorksheet('Sonuçlar', {
    properties: { tabColor: { argb: 'FF15594F' }, defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '5:5' }
  });
  sheet.columns = report.columns.map(column => ({
    width: column.width, style: {
      font: { name: 'Calibri', size: 11, color: { argb: 'FF182720' } },
      numFmt: { percent: '0.0%', decimal: '0.0', integer: '0', date: 'dd.mm.yyyy hh:mm' }[column.kind]
    }
  }));
  const solid = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  function merged(row, text, height, font) {
    sheet.mergeCells(row, 1, row, report.columns.length);
    const cell = sheet.getCell(row, 1);
    cell.value = text;
    cell.font = font;
    cell.alignment = { vertical: 'middle', wrapText: true };
    sheet.getRow(row).height = height;
  }
  merged(1, report.title, 31, { size: 19, bold: true, color: { argb: 'FF15594F' } });
  const muted = { size: 11, color: { argb: 'FF53635B' } };
  merged(2, report.subtitle, 23, muted);
  merged(3, report.note, 31, muted);
  sheet.getRow(4).height = 8;
  const header = sheet.addRow(report.columns.map(column => column.title));
  header.height = 26;
  header.eachCell(cell => {
    cell.fill = solid('FFE8F2EE');
    cell.font = { bold: true, color: { argb: 'FF15594F' } };
    cell.alignment = { vertical: 'middle' };
  });
  for (const values of report.rows) {
    const row = sheet.addRow(values.map((value, index) => excelValue(value, report.columns[index])));
    row.height = Math.max(22, ...values.map((value, index) => typeof value === 'string' && report.columns[index].kind !== 'date' ?
      15 * Math.max(1, Math.ceil(value.length / (report.columns[index].width - 2))) + 5 : 22));
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      const column = report.columns[index - 1];
      cell.alignment = { wrapText: true, vertical: 'middle', horizontal: column.kind ? 'right' : 'left' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE4EBE7' } } };
      if (column.score && cell.value !== null) cell.font = { bold: true, color: { argb: 'FF15594F' } };
    });
  }
  if (!report.rows.length) merged(6, 'Bu seçim için öğrenci kaydı yok.', 22, muted);
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, 5 + report.rows.length), column: report.columns.length } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function sendReport(res, format, report, fail) {
  if (format !== 'pdf' && format !== 'xlsx') fail(400, 'Rapor türü PDF veya Excel olmalıdır.');
  const content = format === 'pdf' ? await makePdf(report) : await makeExcel(report);
  res.attachment(report.filename + '.' + format).send(content);
}
