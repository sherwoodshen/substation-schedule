import { useRef, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { backupFileName, readBackupFile } from '../../services/backupData.mjs';
import { getAllPlans, importPlans } from '../../storage/planRepository.js';

export default function DataBackupActions({ onImported }) {
  const input = useRef(null);
  const [backup, setBackup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function exportData() {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const records = await getAllPlans();
      const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      try {
        anchor.href = url;
        anchor.download = backupFileName();
        document.body.append(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setMessage(`已生成 ${records.length} 条排班记录的 JSON 备份，请在浏览器下载中查看。`);
    } catch {
      setError('导出失败，请确认浏览器允许本地存储后重试。');
    } finally {
      setBusy(false);
    }
  }

  async function selectFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const records = await readBackupFile(file);
      setBackup({ name: file.name, records });
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport(mode) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await importPlans(backup.records, mode);
      const firstDate = backup.records.map(row => row.date).sort()[0];
      setMessage(mode === 'replace'
        ? `覆盖完成，当前共有 ${result.total} 条排班记录。`
        : `合并完成，新增 ${result.added} 条，跳过 ${result.skipped} 条重复记录。`);
      setBackup(null);
      onImported(firstDate);
    } catch (error) {
      setError(error instanceof RangeError ? error.message : '导入失败，请重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <footer className="mt-6 space-y-3 border-t border-slate-200 pt-4" aria-label="数据备份与同步">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="secondary-button" disabled={busy} onClick={exportData}>导出系统数据</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => input.current.click()}>导入系统数据</button>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={selectFile} />
      </div>
      <p className="text-xs leading-relaxed text-slate-500">通过 JSON 备份文件，在不同电脑之间离线转移已确认的排班。</p>
      {busy && !backup && <p role="status" className="text-sm text-slate-600">正在处理数据…</p>}
      {message && <p role="status" className="text-sm text-teal-900">{message}</p>}
      {error && !backup && <p role="alert" className="text-sm text-red-800">{error}</p>}

      {backup && (
        <Modal title="导入系统数据" busy={busy} onClose={() => { setBackup(null); setError(''); }}>
          <div className="space-y-4 p-4 text-sm leading-relaxed sm:p-6">
            <p className="wrap-break-word text-slate-600">{backup.name}</p>
            <p className="text-base font-semibold text-slate-950">检测到备份文件中包含 {backup.records.length} 条排班记录。请选择导入方式：</p>
            <p className="rounded-xl bg-rose-50 p-3 text-rose-900">覆盖当前数据将清空本机已有排班，并完整使用备份文件中的记录。</p>
            <p className="rounded-xl bg-slate-50 p-3 text-slate-700">合并新增数据按日期、站点、任务及设备去重，已有记录保留本机内容。不同任务可在同一天、同一站点同时保留。</p>
            {error && <p role="alert" className="text-red-800">{error}</p>}
          </div>
          <div className="panel-footer justify-end">
            <button type="button" className="secondary-button border-rose-300 text-rose-800" disabled={busy} onClick={() => confirmImport('replace')}>覆盖当前数据</button>
            <button type="button" className="primary-button" disabled={busy} onClick={() => confirmImport('merge')}>合并新增数据</button>
          </div>
        </Modal>
      )}
    </footer>
  );
}
