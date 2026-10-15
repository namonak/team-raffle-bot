import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('Teams ZIP에 치환된 manifest, 규격 아이콘만 담는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'raffle-package-'));
  try {
    cpSync('appPackage', join(dir, 'appPackage'), { recursive: true });
    writeFileSync(join(dir, '.env'), 'MicrosoftAppId=00000000-0000-0000-0000-000000000001\nMicrosoftAppPassword=must-not-be-packaged\n');
    const script = join(process.cwd(), 'scripts/package-teams-app.sh');
    const result = spawnSync('bash', [script], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const [archive] = readdirSync(join(dir, 'dist'));
    assert.match(archive, /^team-raffle-bot-\d{8}-\d{6}\.zip$/);
    const path = join(dir, 'dist', archive);
    assert.deepEqual(spawnSync('unzip', ['-Z1', path], { encoding: 'utf8' }).stdout.trim().split('\n').sort(), ['color.png', 'manifest.json', 'outline.png']);
    const contents = spawnSync('unzip', ['-p', path, 'manifest.json'], { encoding: 'utf8' }).stdout;
    const manifest = JSON.parse(contents);
    assert.equal(manifest.id, '00000000-0000-0000-0000-000000000001');
    assert.equal(manifest.bots[0].botId, manifest.id);
    assert.deepEqual(manifest.bots[0].scopes, ['groupChat']);
    assert.equal(manifest.bots[0].commandLists[0].commands.length, 2);
    assert.equal(manifest.name.short, '쿠웨이트박');
    assert.ok(!contents.includes('must-not-be-packaged'));
    assert.ok(!contents.includes('{{'));
    for (const [name, size] of [['color', 192], ['outline', 32]] as const) {
      const png = readFileSync(join(dir, 'appPackage', `${name}.png`));
      assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
    }
    writeFileSync(join(dir, '.env'), 'MicrosoftAppId=bad$(id)\n');
    assert.notEqual(spawnSync('bash', [script], { cwd: dir, encoding: 'utf8' }).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('outline은 투명 배경과 흰색 단색이며 color는 불투명하다', async () => {
  const { decodePng } = await import('./png.js');
  const outline = decodePng(readFileSync('appPackage/outline.png'));
  assert.equal(outline.channels, 4);
  let transparent=0, visible=0;
  for(let i=0;i<outline.pixels.length;i+=4){
    if(outline.pixels[i+3]===0)transparent++;
    else {visible++;assert.deepEqual([...outline.pixels.subarray(i,i+3)],[255,255,255]);}
  }
  assert.ok(transparent>100);assert.ok(visible>100);
  const color=decodePng(readFileSync('appPackage/color.png'));
  if(color.channels===4)for(let i=3;i<color.pixels.length;i+=4)assert.equal(color.pixels[i],255);
});
