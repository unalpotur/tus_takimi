import { build } from 'esbuild';
import { compile } from 'tailwindcss';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

await mkdir('dist/public', { recursive: true });
await Promise.all([
  build({
    entryPoints: ['server/index.mjs'], bundle: true, platform: 'node', target: 'node24',
    format: 'cjs', outfile: 'dist/server.cjs', legalComments: 'linked'
  }),
  build({
    entryPoints: ['web/app.jsx'], bundle: true, platform: 'browser', target: 'es2022',
    jsx: 'automatic', minify: true, outfile: 'dist/public/app.js', legalComments: 'linked',
    define: { 'process.env.NODE_ENV': '"production"' }
  }),
  cp('web/index.html', 'dist/public/index.html'),
  cp('web/mark.svg', 'dist/public/mark.svg'),
  installNotices(),
  installPdfAssets(),
  installFont('@fontsource-variable/instrument-sans', 'wght.css', 'sans'),
  installFont('@fontsource/instrument-serif', '400.css', 'serif'),
  (async () => {
    const [css, theme, app, activities] = await Promise.all([
      readFile('web/styles.css', 'utf8'), readFile('node_modules/tailwindcss/theme.css', 'utf8'),
      readFile('web/app.jsx', 'utf8'), readFile('web/activities.jsx', 'utf8')
    ]);
    const engine = await compile(theme + '\n' + css);
    const candidates = [...new Set((app + '\n' + activities).match(/[\w:/.-]+/g))];
    await writeFile('dist/public/styles.css', engine.build(candidates));
  })()
]);

async function installPdfAssets() {
  const packages = 'node_modules/@foliojs-fork/';
  // The Node PDF renderer resolves these files next to the bundled server.
  await Promise.all([
    ...['data', 'indic', 'use'].map(name => cp(packages + 'fontkit/' + name + '.trie', 'dist/' + name + '.trie')),
    cp(packages + 'linebreak/src/classes.trie', 'dist/classes.trie'),
    cp(packages + 'pdfkit/js/data', 'dist/data', { recursive: true })
  ]);
}

async function installNotices() {
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const packages = Object.entries(lock.packages).filter(([path, meta]) =>
    path && (!meta.dev || path === 'node_modules/tailwindcss'));
  const notices = await Promise.all(packages.map(async ([path, meta]) => {
    const files = await readdir(path);
    const license = files.find(file => /^(licen[sc]e|copying)(\.\w+)?$/i.test(file));
    const text = license ? await readFile(path + '/' + license, 'utf8') : meta.license || '';
    return path.split('node_modules/').at(-1) + ' ' + meta.version + '\n\n' + text.trim();
  }));
  await writeFile('dist/third-party-notices.txt', notices.join('\n\n' + '-'.repeat(64) + '\n\n'));
}

async function installFont(name, stylesheet, alias) {
  const base = 'node_modules/' + name;
  const css = await readFile(base + '/' + stylesheet, 'utf8');
  const paths = [...new Set([...css.matchAll(/url\((\.\/files\/[^)]+)\)/g)].map(match => match[1]))];
  await mkdir('dist/public/fonts/files', { recursive: true });
  await Promise.all(paths.map(path => cp(base + '/' + path, 'dist/public/fonts/' + path)));
  await Promise.all([
    writeFile('dist/public/fonts/' + alias + '.css', css),
    cp(base + '/LICENSE', 'dist/public/fonts/' + alias + '-LICENSE.txt')
  ]);
}
