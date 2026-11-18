import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const backupFileName = '小营变电班排班数据_自动备份.json';

export function createBackupWriter(directory) {
  const destination = join(directory, backupFileName);
  let pending = Promise.resolve();

  return {
    save(json) {
      if (typeof json !== 'string') throw new TypeError('备份必须是 JSON 文本。');
      const snapshot = JSON.parse(json);
      if (snapshot?.format !== 'substation-schedule' || snapshot.version !== 2
        || !Array.isArray(snapshot.tasks) || !Array.isArray(snapshot.plans)) {
        throw new TypeError('排班备份格式无效。');
      }

      const write = pending.then(async () => {
        await mkdir(directory, { recursive: true });
        const temporaryFile = join(directory, `.${randomUUID()}.tmp`);
        try {
          await writeFile(temporaryFile, json, { encoding: 'utf8', flag: 'wx', flush: true });
          await rename(temporaryFile, destination);
        } finally {
          await unlink(temporaryFile).catch(() => {});
        }
      });
      pending = write.catch(() => {}); // Let the next snapshot proceed if a write fails.
      return write;
    },
    flush: () => pending,
  };
}
