import { Blob as NodeBlob } from 'node:buffer';
import Dexie from 'dexie';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as repository from '../src/storage/planRepository.js';
import { readBackupFile } from '../src/services/backupData.mjs';
import DataBackupActions from '../src/features/backup/DataBackupActions.jsx';
import DayPlanList from '../src/features/calendar/DayPlanList.jsx';

const fixtureDb = new Dexie('substation-schedule');
fixtureDb.version(2).stores({ plans: '++id,date,taskId', tasks: 'taskId,createdAt,updatedAt' });
const makePlan = (id, task) => ({
  id, date: '2026-11-05', stationName: '宁海路', voltage: '220kV',
  taskType: '保电', level: 2, noticeNumber: task, equipment: '宁海路变1号主变',
  method: 'manual', inspectionCount: 1, temperatureCount: 1, isPreStart: false,
});
const [a, b, c, d, e] = ['A', 'B', 'C', 'D', 'E'].map((task, index) => makePlan(index + 1, task));
// 历史用例比较原有业务字段；任务外键在 TaskRepository 用例中独立校验。
const businessRows = rows => rows.map(({ taskId, ...row }) => row);
const withoutIds = rows => businessRows(rows).map(({ id, ...row }) => row);
let fileTexts;
let readAsText;
let createObjectURL;
let revokeObjectURL;

beforeEach(async () => {
  await fixtureDb.plans.clear();
  await fixtureDb.tasks.clear();
  fileTexts = new WeakMap();
  readAsText = vi.fn(function (file) {
    queueMicrotask(() => {
      this.result = fileTexts.get(file);
      this.onload?.({ target: this });
    });
  });
  vi.stubGlobal('FileReader', class {
    readAsText = readAsText;
  });
  vi.stubGlobal('Blob', NodeBlob);
  createObjectURL = vi.fn(() => 'blob:delete-regression');
  revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => fixtureDb.close());

async function seedAndDeleteC() {
  await repository.savePlans([a, b, c]);
  await repository.deletePlanById(c.id);
  expect(businessRows(await repository.getAllPlans())).toEqual([a, b]);
}

async function readRecords(records) {
  const text = JSON.stringify(records);
  const file = new File([text], 'backup.json', { type: 'application/json' });
  fileTexts.set(file, text);
  const parsed = await readBackupFile(file);
  expect(readAsText).toHaveBeenLastCalledWith(file, 'UTF-8');
  return parsed;
}

async function downloadRecords(count) {
  fireEvent.click(screen.getByRole('button', { name: '导出系统数据' }));
  await screen.findByText(new RegExp(`已生成 ${count} 条排班记录及`));
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  const [blob] = createObjectURL.mock.calls[0];
  expect(blob.type).toBe('application/json;charset=utf-8');
  const text = await blob.text();
  await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:delete-regression'), { timeout: 2000 });
  const backup = JSON.parse(text);
  expect(backup.version).toBe(2);
  return { text, records: businessRows(backup.plans), backup };
}

describe('单条删除：仓储与持久化', () => {
  it.each([['首条', a], ['中间条', b], ['末条', c]])('只删除%s，其他记录完整保留且重新连接后仍然生效', async (_position, target) => {
    const original = [a, b, c];
    await repository.savePlans(original);
    await repository.deletePlanById(target.id);
    const expected = original.filter(row => row.id !== target.id);
    expect(businessRows(await repository.getAllPlans())).toEqual(expected);
    expect(await fixtureDb.plans.get(target.id)).toBeUndefined();
    fixtureDb.close();
    await fixtureDb.open();
    expect(businessRows(await fixtureDb.plans.orderBy('date').toArray())).toEqual(expected);
  });

  it('重复删除同一 ID 和删除不存在的 ID 均不误删其他记录', async () => {
    await seedAndDeleteC();
    await expect(repository.deletePlanById(c.id)).resolves.toBeUndefined();
    await expect(repository.deletePlanById(999999)).resolves.toBeUndefined();
    expect(businessRows(await repository.getAllPlans())).toEqual([a, b]);
  });

  it.each([0, -1, 1.5, '1', null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    '非法 ID %s 被明确拒绝且仓储保持不变', async id => {
      await repository.savePlans([a, b, c]);
      expect(() => repository.deletePlanById(id)).toThrow('排班记录 ID 无效。');
      expect(businessRows(await repository.getAllPlans())).toEqual([a, b, c]);
    },
  );

  it('删除后通知 liveQuery 订阅者更新，避免日历继续显示旧记录', async () => {
    await repository.savePlans([a, b, c]);
    const next = vi.fn();
    const error = vi.fn();
    const subscription = repository.watchPlans({ next: rows => next(businessRows(rows)), error });
    try {
      await waitFor(() => expect(next).toHaveBeenLastCalledWith([a, b, c]));
      await repository.deletePlanById(c.id);
      await waitFor(() => expect(next).toHaveBeenLastCalledWith([a, b]));
      expect(error).not.toHaveBeenCalled();
    } finally {
      subscription.unsubscribe();
    }
  });
});

describe('单条删除：实际 JSON 导出回归', () => {
  it('导出组件在删除前挂载，删除后实际下载仍只包含 A、B', async () => {
    await repository.savePlans([a, b, c]);
    render(<DataBackupActions onImported={vi.fn()} />);
    await repository.deletePlanById(c.id);
    const { text, records } = await downloadRecords(2);
    expect(records).toEqual([a, b]);
    expect(JSON.parse(text).plans).toHaveLength(2);
    expect(records.some(row => row.id === c.id || row.noticeNumber === 'C')).toBe(false);
    expect(businessRows(await repository.getAllPlans())).toEqual([a, b]);
  });

  it('删掉最后一条后导出空数组，不会复活已删除的数据', async () => {
    await repository.savePlans([a]);
    await repository.deletePlanById(a.id);
    render(<DataBackupActions onImported={vi.fn()} />);
    const { text, records } = await downloadRecords(0);
    expect(JSON.parse(text).plans).toEqual([]);
    expect(records).toEqual([]);
    expect(businessRows(await repository.getAllPlans())).toEqual([]);
  });
});

describe('单条删除：JSON 文件导入联动', () => {
  it('合并 A/B/C 恢复已删除的 C，重复导入不产生重复任务', async () => {
    await seedAndDeleteC();
    const records = await readRecords([a, b, c]);
    const result = await repository.importPlans(records, 'merge');
    expect(result).toEqual({ added: 1, skipped: 2, total: 3 });
    const restored = businessRows(await repository.getAllPlans());
    // 本机 ID 重新生成；原有 A/B 必须保持原样，恢复的 C 业务字段必须完整。
    expect(restored.slice(0, 2)).toEqual([a, b]);
    expect(withoutIds(restored)).toEqual(withoutIds([a, b, c]));
    expect(new Set(restored.map(row => row.id)).size).toBe(3);
    expect(await repository.importPlans(records, 'merge')).toEqual({ added: 0, skipped: 3, total: 3 });
    expect(businessRows(await repository.getAllPlans())).toEqual(restored);
  });

  it('覆盖 D/E 完全清除删除后剩余的 A/B，并持久化纯净结果', async () => {
    await seedAndDeleteC();
    const records = await readRecords([d, e]);
    expect(await repository.importPlans(records, 'replace')).toEqual({ added: 2, skipped: 0, total: 2 });
    const stored = businessRows(await repository.getAllPlans());
    expect(withoutIds(stored)).toEqual(withoutIds([d, e]));
    expect(stored.some(row => ['A', 'B', 'C'].includes(row.noticeNumber))).toBe(false);
    fixtureDb.close();
    await fixtureDb.open();
    expect(businessRows(await fixtureDb.plans.orderBy('date').toArray())).toEqual(stored);
  });
});

describe('单条删除：现有界面的操作回归（仅测试，不修改组件）', () => {
  it('取消确认时三条记录完整保留且不触发更新回调', async () => {
    await repository.savePlans([a, b, c]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onPlanUpdated = vi.fn();
    render(<DayPlanList date={a.date} plans={[a, b, c]} onPlanUpdated={onPlanUpdated} />);
    fireEvent.click(screen.getAllByRole('button', { name: /^删除 /u })[2]);
    expect(confirm).toHaveBeenCalledWith('确认删除该条巡视计划吗？');
    expect(businessRows(await repository.getAllPlans())).toEqual([a, b, c]);
    expect(screen.getByText('3 条计划')).toBeTruthy();
    expect(onPlanUpdated).not.toHaveBeenCalled();
  });

  it('确认删除 C 后界面只剩两条，仓储同步更新且只回调一次', async () => {
    await repository.savePlans([a, b, c]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onPlanUpdated = vi.fn();
    render(<DayPlanList date={a.date} plans={[a, b, c]} onPlanUpdated={onPlanUpdated} />);
    const row = screen.getByText('二级保电C').closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: /^删除 /u }));
    await screen.findByText('2 条计划');
    expect(screen.queryByText('二级保电C')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^删除 /u })).toHaveLength(2);
    expect(businessRows(await repository.getAllPlans())).toEqual([a, b]);
    expect(onPlanUpdated).toHaveBeenCalledExactlyOnceWith(c.id);
  });

  it('模拟删除写入失败时显示友好提示，保留行和数据且不回调成功', async () => {
    await repository.savePlans([a, b, c]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    // 故障注入只存在于本测试，其他用例均调用真实仓储方法。
    vi.spyOn(repository, 'deletePlanById').mockRejectedValueOnce(new Error('模拟 IndexedDB 写入失败'));
    const onPlanUpdated = vi.fn();
    render(<DayPlanList date={a.date} plans={[a, b, c]} onPlanUpdated={onPlanUpdated} />);
    fireEvent.click(screen.getAllByRole('button', { name: /^删除 /u })[2]);
    expect((await screen.findByRole('alert')).textContent).toBe('删除失败，请重试。');
    expect(screen.getByText('3 条计划')).toBeTruthy();
    expect(businessRows(await repository.getAllPlans())).toEqual([a, b, c]);
    expect(onPlanUpdated).not.toHaveBeenCalled();
    for (const button of screen.getAllByRole('button', { name: /^删除 /u })) {
      expect(button.disabled).toBe(false);
    }
  });
});
