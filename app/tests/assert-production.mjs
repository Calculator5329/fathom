import fs from 'node:fs/promises';
import path from 'node:path';
const files = (await fs.readdir('dist/assets')).filter(file => file.endsWith('.js'));
const markers = ['dev.voice.confirm', 'Voice navigation · local prototype', '/__agent-handles/command'];
for (const file of files) {
  const source = await fs.readFile(path.join('dist/assets', file), 'utf8');
  for (const marker of markers) if (source.includes(marker)) throw new Error(`Dev-only prototype/executor marker ${marker} found in ${file}`);
}
console.log(JSON.stringify({ check: 'dev-only prototype absent from production JavaScript', bundles: files.length, forbiddenMarkers: markers.length, passed: true }));
