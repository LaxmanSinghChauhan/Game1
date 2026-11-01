// Bundles src/main.js (with three.js) and every file in assets/ into ONE self-contained index.html
// that runs offline in Chrome by double-clicking it.
import { build } from 'esbuild';
import fs from 'fs';

const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020' });
const js = r.outputFiles[0].text;

const MIME = { glb: 'model/gltf-binary', gltf: 'model/gltf+json', png: 'image/png' };
const assets = {};
for (const f of fs.readdirSync('assets')) {
  const mime = MIME[f.split('.').pop()];
  if (mime) assets[f] = `data:${mime};base64,` + fs.readFileSync('assets/' + f).toString('base64');
}
const html = fs.readFileSync('src/index.template.html', 'utf8')
  .replace('/*ASSETS*/', () => 'window.ASSETS=' + JSON.stringify(assets) + ';')
  .replace('/*GAME*/', () => js.replace(/<\/script/gi, '<\\/script'));
fs.writeFileSync('index.html', html);
console.log(`index.html written: ${(html.length / 1048576).toFixed(2)} MB, ${Object.keys(assets).length} assets`);
