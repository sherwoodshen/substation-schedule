import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, mkdir, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { backupFileName, createBackupWriter } from '../electron/backupFile.js';
import { parseSystemBackupText } from '../src/services/backupData.mjs';

function snapshot(tasks = [], plans = []) {
  return JSON.stringify({ format: 'substation-schedule', version: 2, tasks, plans });
}

test('桌面备份按顺序替换同一文件，拒绝无效 JSON 并且不遗留临时文件', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'schedule-backup-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const writer = createBackupWriter(directory);
  const destination = join(directory, backupFileName);
  const first = snapshot([{ taskId: '第一份' }]);
  await writer.save(first);
  assert.equal(await readFile(destination, 'utf8'), first);

  assert.throws(() => writer.save('{"tasks":[]}'), /格式无效/);
  assert.equal(await readFile(destination, 'utf8'), first);
  await Promise.all([writer.save(snapshot([{ taskId: '较早写入' }])), writer.save(snapshot())]);
  await writer.flush();
  assert.deepEqual(parseSystemBackupText(await readFile(destination, 'utf8')), { tasks: [], records: [] });
  assert.deepEqual(await readdir(directory), [backupFileName]);
});

test('一次磁盘写入失败后，后续自动备份仍可以保存', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'schedule-backup-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const writer = createBackupWriter(directory);
  const destination = join(directory, backupFileName);
  await mkdir(destination);
  await assert.rejects(writer.save(snapshot()));
  assert.deepEqual(await readdir(directory), [backupFileName]);
  await rmdir(destination);
  await writer.save(snapshot());
  assert.equal(await readFile(destination, 'utf8'), snapshot());
});
