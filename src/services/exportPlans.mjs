import ExcelJS from 'exceljs';
import { cleanEquipmentText } from './equipmentDisplay.mjs';
import { formatTaskName } from './taskName.mjs';

const columns = [
  { header: '日期', width: 14 },
  { header: '变电站', width: 12 },
  { header: '保电任务', width: 28 },
  { header: '保电设备', width: 44 },
  { header: '巡视记录', width: 13 },
  { header: '测温记录', width: 13 },
  { header: '巡视人', width: 16 },
];

export function getPlansInDateRange(plans, { startDate, endDate }) {
  return plans.filter(row => row.date >= startDate && row.date <= endDate)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function wrappedLineCount(value, width) {
  return String(value).split(/\r?\n/u).reduce((total, line) => {
    const length = Array.from(line).reduce((count, character) => (
      count + (character.charCodeAt(0) > 255 ? 2 : 1)
    ), 0);
    return total + Math.max(1, Math.ceil(length / width));
  }, 0);
}

export function createScheduleWorkbook(plans, range) {
  const { startDate, endDate } = range;
  for (const date of [startDate, endDate]) {
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
      throw new RangeError('请选择完整且有效的起止日期。');
    }
  }
  if (endDate < startDate) throw new RangeError('结束日期须等于或晚于起始日期。');

  const selectedPlans = getPlansInDateRange(plans, range);
  if (selectedPlans.length === 0) throw new RangeError('所选日期范围没有已确认的巡视计划，请调整日期。');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '特殊巡视排班系统';
  const sheet = workbook.addWorksheet('巡视安排', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.55, bottom: 0.5, header: 0.2, footer: 0.2 },
      printTitlesRow: '1:1',
    },
    headerFooter: {
      oddHeader: '&C&"宋体,Bold"&14特殊巡视安排',
      oddFooter: `&L${startDate} 至 ${endDate}&R第 &P 页 / 共 &N 页`,
    },
  });
  sheet.columns = columns;

  for (const plan of selectedPlans) {
    const values = [
      plan.date,
      plan.stationName,
      formatTaskName(plan),
      cleanEquipmentText(plan.equipment, plan.stationName) || '—',
      `${plan.method === 'robot' ? '机器' : '人工'} ${plan.inspectionCount} 次`,
      `测温 ${plan.temperatureCount} 次`,
      '',
    ];
    const row = sheet.addRow(values);
    const maxLines = Math.max(...values.map((value, index) => wrappedLineCount(value, columns[index].width - 3)));
    row.height = Math.max(32, maxLines * 17 + 12);
  }

  sheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.font = { name: '宋体', size: 11, bold: rowNumber === 1, color: { argb: 'FF000000' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: rowNumber > 1 && [3, 4].includes(columnNumber) ? 'left' : 'center',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
      if (rowNumber === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });
  });
  sheet.getRow(1).height = 32;
  sheet.pageSetup.printArea = `A1:G${sheet.rowCount}`;
  return workbook;
}
