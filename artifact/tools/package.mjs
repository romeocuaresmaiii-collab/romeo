// Packages the built page for publishing: minifies every inline script (no top-level renames) and moves each one into
// its own file under share/js/, so no single file is too large for Claude's sharing review (the whole app in one page,
// 1.5 MB, cannot be reviewed; split files of up to ~480 KB can). Usage: node artifact/tools/package.mjs
// Needs terser (npm i terser@5.31.0; or set TERSER to the package folder).
import { createRequire } from 'module';
const { minify } = createRequire(import.meta.url)(process.env.TERSER || 'terser');   // TERSER = path to the terser package if it is not installed here
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const inp = path.join(dist, 'RSH Sports Marketing OS.html'), outDir = path.join(dist, 'share');
fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(path.join(outDir, 'js'), { recursive: true });
let s = fs.readFileSync(inp, 'utf8'); const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g; const parts = []; let last = 0, m, n = 0, biggest = 0;
while ((m = re.exec(s))) {
  parts.push(s.slice(last, m.index)); last = re.lastIndex;
  const attrs = m[1] || '', code = m[2];
  if (/\bsrc=/.test(attrs) || /type="(application\/json|text\/plain)"/.test(attrs) || !code.trim()) { parts.push(m[0]); continue; }
  const r = await minify(code, { compress: { passes: 2 }, mangle: { toplevel: false }, format: { comments: false } });
  const name = `js/app${String(++n).padStart(2, '0')}.js`; fs.writeFileSync(path.join(outDir, name), r.code); biggest = Math.max(biggest, r.code.length);
  parts.push(`<script src="${name}"></script>`);
}
parts.push(s.slice(last)); s = parts.join('');
s = s.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (_, a, c) => `<style${a}>${c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').trim()}</style>`);
if (biggest > 600000) throw new Error('a script file is ' + biggest + ' bytes: split it before publishing (the sharing review limit)');
fs.writeFileSync(path.join(outDir, 'index.html'), s);
console.log(`packaged: page ${s.length} bytes + ${n} script files (largest ${biggest} bytes) in artifact/dist/share`);
