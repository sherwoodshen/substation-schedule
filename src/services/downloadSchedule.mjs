import { saveAs } from 'file-saver';
import { createScheduleWorkbook } from './exportPlans.mjs';

export async function downloadSchedule(plans, range, filename) {
  const workbook = createScheduleWorkbook(plans, range);
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
