import { Blob as NodeBlob } from 'node:buffer';
import Dexie from 'dexie';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DataBackupActions from '../src/features/backup/DataBackupActions.jsx';
import { getAllPlans, importPlans, savePlans } from '../src/storage/planRepository.js';
import { readBackupFile } from '../src/services/backupData.mjs';

const fixtureDb = new Dexie('substation-schedule');
fixtureDb.version(1).stores({ plans: '++id,date' });
const plan = (id, noticeNumber = `任务${id}`) => ({
  id, date: '2026-11-05', stationName: '宁海路', voltage: '220kV',
  taskType: '保电', level: 2, noticeNumber, equipment: '宁海路变1号主变',
  method: 'manual', inspectionCount: 1, temperatureCount: 1, isPreStart: false,
});
const withoutIds = rows => rows.map(({ id, ...row }) => row);
let readerText;
let readerEvent;
let readAsText;
let createObjectURL;
let revokeObjectURL;
let downloads;

beforeEach(async () => {
  await fixtureDb.plans.clear();
  readerText = '';
  readerEvent = 'load';
  downloads = [];
  const values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(key => values.get(String(key)) ?? null),
    setItem: vi.fn((key, value) => values.set(String(key), String(value))),
    removeItem: vi.fn(key => values.delete(String(key))),
    clear: vi.fn(() => values.clear()),
    key: vi.fn(index => [...values.keys()][index] ?? null),
    get length() { return values.size; },
  });
  readAsText = vi.fn(function () {
    queueMicrotask(() => {
      this.result = readerText;
      this[`on${readerEvent}`]?.({ target: this });
    });
  });
  vi.stubGlobal('FileReader', class {
    result = null;
    readAsText = readAsText;
  });
  vi.stubGlobal('Blob', NodeBlob);
  createObjectURL = vi.fn(() => 'blob:sync-backup');
  revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    downloads.push({ name: this.download, href: this.href });
  });
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function () {
    this.setAttribute('open', '');
  });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function () {
    this.removeAttribute('open');
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => fixtureDb.close());

function selectBackup(text, onImported = vi.fn()) {
  readerText = text;
  const view = render(<DataBackupActions onImported={onImported} />);
  const file = new File([text], 'backup.json', { type: 'application/json' });
  fireEvent.change(view.container.querySelector('input[type="file"]'), { target: { files: [file] } });
  return { file, onImported };
}

async function exportBackup() {
  render(<DataBackupActions onImported={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '导出系统数据' }));
  await screen.findByText(/已生成 2 条排班记录/);
  // 等待实际下载清理，避免撤销 URL 的计时器泄漏到后续测试。
  await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:sync-backup'), { timeout: 2000 });
}

describe('Export：真实仓储到浏览器下载', () => {
  it('完整序列化本地两条记录，生成 JSON Blob 并清理下载资源', async () => {
    const records = [plan(1), plan(2)];
    await savePlans(records);
    await exportBackup();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = createObjectURL.mock.calls[0];
    expect(blob.type).toBe('application/json;charset=utf-8');
    const text = await blob.text();
    expect(JSON.parse(text)).toEqual(records);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].href).toBe('blob:sync-backup');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(await getAllPlans()).toEqual(records);
  });

  it('下载文件名精确使用备份_YYYYMMDD_HHMM.json并补齐月份和时间零位', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 2, 3, 4));
    await savePlans([plan(1), plan(2)]);
    await exportBackup();
    expect(downloads[0].name).toMatch(/^备份_\d{8}_\d{4}\.json$/u);
    expect(downloads[0].name).toBe('备份_20260102_0304.json');
  });
});

describe('Import & Parse：FileReader 与错误恢复', () => {
  it('合法文件识别条数，在确认导入之前不写入数据', async () => {
    const old = [plan(9)];
    await savePlans(old);
    const { file } = selectBackup(JSON.stringify([plan(1), plan(2), plan(3)]));
    await screen.findByText(/检测到备份文件中包含 3 条排班记录/);
    expect(readAsText).toHaveBeenCalledWith(file, 'UTF-8');
    expect(await getAllPlans()).toEqual(old);
  });

  it('损坏 JSON 显示友好错误，保留旧数据且允许重新选择有效文件', async () => {
    const old = [plan(9)];
    await savePlans(old);
    const { onImported } = selectBackup('[{"date":');
    expect((await screen.findByRole('alert')).textContent).toContain('文件不是有效的 JSON');
    expect(await getAllPlans()).toEqual(old);
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    readerText = JSON.stringify([plan(1)]);
    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [new File([readerText], 'valid.json')] },
    });
    await screen.findByText(/检测到备份文件中包含 1 条排班记录/);
    expect(await getAllPlans()).toEqual(old);
  });

  it.each([
    ['error', '文件读取失败，请重新选择。'],
    ['abort', '文件读取已取消。'],
  ])('FileReader %s 被捕获且不清空仓储', async (event, message) => {
    const old = [plan(9)];
    await savePlans(old);
    readerEvent = event;
    selectBackup('[]');
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(await getAllPlans()).toEqual(old);
  });

  it('带 BOM 的备份也能正确解析', async () => {
    readerText = `\uFEFF${JSON.stringify([plan(1), plan(2)])}`;
    await expect(readBackupFile(new File([], 'bom.json'))).resolves.toEqual([plan(1), plan(2)]);
  });
});

describe('Merge & Overwrite：真实 IndexedDB 及组件完成状态', () => {
  it('覆盖删除一条旧数据并完整保存三条新数据，通知日历刷新', async () => {
    await savePlans([plan(99, '旧任务')]);
    const incoming = [plan(1, 'A'), plan(2, 'B'), plan(3, 'C')];
    const { onImported } = selectBackup(JSON.stringify(incoming));
    await screen.findByText(/检测到备份文件中包含 3 条排班记录/);
    fireEvent.click(screen.getByRole('button', { name: '覆盖当前数据' }));
    await screen.findByText('覆盖完成，当前共有 3 条排班记录。');
    // 导入会重新分配本机主键，所有业务字段应完整相等。
    const stored = await getAllPlans();
    expect(withoutIds(stored)).toEqual(withoutIds(incoming));
    expect(new Set(stored.map(row => row.id)).size).toBe(3);
    expect(onImported).toHaveBeenCalledExactlyOnceWith('2026-11-05');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('本地 A(1)、B(2) 合并 B(2)、C(3) 仅保留 A/B/C 各一条', async () => {
    const a = plan(1, 'A');
    const b = plan(2, 'B');
    const c = plan(3, 'C');
    await savePlans([a, b]);
    const { onImported } = selectBackup(JSON.stringify([b, c]));
    await screen.findByText(/检测到备份文件中包含 2 条排班记录/);
    fireEvent.click(screen.getByRole('button', { name: '合并新增数据' }));
    await screen.findByText('合并完成，新增 1 条，跳过 1 条重复记录。');
    const stored = await getAllPlans();
    expect(withoutIds(stored)).toEqual(withoutIds([a, b, c]));
    expect(stored.slice(0, 2)).toEqual([a, b]);
    expect(new Set(stored.map(row => row.id)).size).toBe(3);
    expect(onImported).toHaveBeenCalledExactlyOnceWith('2026-11-05');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('跨电脑 ID 碰撞不丢新任务，同业务不同 ID 不重复且保留本机人工调整', async () => {
    const local = plan(1, 'A');
    await savePlans([local]);
    const duplicate = { ...local, id: 999, method: 'robot', temperatureCount: 0 };
    const newTask = plan(1, 'B');
    const result = await importPlans([duplicate, newTask, newTask], 'merge');
    expect(result).toEqual({ added: 1, skipped: 2, total: 2 });
    const stored = await getAllPlans();
    expect(stored[0]).toEqual(local);
    expect(withoutIds(stored)).toEqual(withoutIds([local, newTask]));
    expect(stored[1].id).not.toBe(local.id);
  });

  it.each(['replace', 'merge'])('%s 在第二条数据无效时整体拒绝且保留现有数据', async mode => {
    const old = [plan(9)];
    await savePlans(old);
    expect(() => importPlans([plan(1), { ...plan(2), date: '2026-02-30' }], mode))
      .toThrow('第 2 条排班记录格式无效，导入已取消。');
    expect(await getAllPlans()).toEqual(old);
  });
});
