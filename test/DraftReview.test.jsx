import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DraftReview from '../src/features/review/DraftReview.jsx';
import { generateSchedule } from '../src/services/ScheduleGenerator.mjs';
import { getAllPlans, importPlans, saveTask } from '../src/storage/planRepository.js';

const form = { taskType: '自定义', projectName: '草稿精调', inspectionDate: '2026-11-06',
  inspectionCount: 1, temperatureCount: 1,
  stationNames: ['小营', '宁海路', '鼓楼'], equipmentText: '小营变2号主变；宁海路变1号主变；鼓楼变母线' };

afterEach(async () => { cleanup(); await importPlans([], 'replace'); });

function Harness({ onSaved, onChange }) {
  const [draft, setDraft] = useState(() => generateSchedule(form));
  return <DraftReview draft={draft} onSaveRow={(index, changes) => {
    onChange?.(index, changes);
    setDraft(current => current.map((row, i) => i === index ? { ...row, ...changes } : row));
  }} onConfirm={async () => { await saveTask(form, draft); onSaved?.(); }} onBack={vi.fn()} />;
}

const rowFor = station => screen.getByRole('rowheader', { name: station }).closest('tr');
const begin = station => fireEvent.click(within(rowFor(station)).getByRole('button', { name: `编辑 2026-11-06 ${station}` }));

it('自定义支持三字段逐行编辑，切换机器不覆盖次数，确认后保存最新明细', async () => {
  const saved = vi.fn();
  render(<Harness onSaved={saved} />);
  expect(screen.queryByText('表单配置')).toBeNull();
  begin('小营');
  fireEvent.change(screen.getByRole('combobox', { name: '巡视方式' }), { target: { value: 'robot' } });
  const temperature = screen.getByRole('spinbutton', { name: '测温次数' });
  expect(temperature.disabled).toBe(false);
  fireEvent.change(screen.getByRole('spinbutton', { name: '巡视次数' }), { target: { value: '3' } });
  fireEvent.change(temperature, { target: { value: '2' } });
  expect(screen.getByRole('button', { name: '确认无误并生效' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
  expect(rowFor('小营').textContent).toContain('机器');
  // 再次打开核对，改过的值不会被机器测温自动计算覆盖。
  begin('小营');
  expect(screen.getByRole('spinbutton', { name: '巡视次数' }).value).toBe('3');
  expect(screen.getByRole('spinbutton', { name: '测温次数' }).value).toBe('2');
  fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '确认无误并生效' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  const records = await getAllPlans();
  expect(records.find(row => row.stationName === '小营')).toMatchObject({ method: 'robot', inspectionCount: 3, temperatureCount: 2 });
  expect(records.filter(row => row.stationName !== '小营').every(row => row.method === 'manual' && row.inspectionCount === 1 && row.temperatureCount === 1)).toBe(true);
});

it('受限主变及无机器站仍仅提供人工，自定义可手动设置 0 次测温', () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  for (const name of ['宁海路', '鼓楼']) {
    begin(name);
    expect(screen.getAllByRole('option').map(option => option.value)).toEqual(['manual']);
    fireEvent.change(screen.getByRole('spinbutton', { name: '测温次数' }), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
  }
  expect(onChange.mock.calls.map(([, changes]) => changes.temperatureCount)).toEqual([0, 0]);
});

it('空值、负数和小数被拒绝，取消编辑不改变任何草稿行', () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  begin('小营');
  for (const value of ['', '0', '-1', '1.5']) {
    fireEvent.change(screen.getByRole('spinbutton', { name: '巡视次数' }), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(screen.getByRole('alert').textContent).toBe('巡视次数请输入正整数。');
  }
  fireEvent.change(screen.getByRole('spinbutton', { name: '巡视次数' }), { target: { value: '2' } });
  for (const value of ['', '-1', '0.5']) {
    fireEvent.change(screen.getByRole('spinbutton', { name: '测温次数' }), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(screen.getByRole('alert').textContent).toBe('测温次数请输入 0 或正整数。');
  }
  fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '确认无误并生效' }).disabled).toBe(false);
});

it('常规任务的 T−1、首日锁定和机器测温计算保持有效', () => {
  const draft = generateSchedule({ ...form, taskType: '保电', level: 1, startDate: '2026-11-06', endDate: '2026-11-06', stationNames: ['小营'] });
  const view = render(<DraftReview draft={draft} onSaveRow={vi.fn()} onConfirm={vi.fn()} onBack={vi.fn()} />);
  expect(screen.getAllByText('规则锁定')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '编辑 2026-11-06 小营' }));
  expect(screen.queryByRole('spinbutton', { name: '巡视次数' })).toBeNull();
  expect(screen.getByRole('spinbutton', { name: '测温次数' }).disabled).toBe(true);
  expect(screen.getByRole('spinbutton', { name: '测温次数' }).value).toBe('2');
  view.rerender(<DraftReview draft={[{ ...draft[0], isPreStart: false, isFirstDayManual: true }]} onSaveRow={vi.fn()} onConfirm={vi.fn()} onBack={vi.fn()} />);
  expect(screen.getByText('规则锁定')).toBeTruthy();
});
