export function formatTaskName({ taskType, level, noticeNumber = '' }) {
  const levelLabel = taskType === '保电'
    ? (level === 1 ? '一级' : '二级')
    : `${level}级`;
  return `${levelLabel}${taskType}${noticeNumber ?? ''}`;
}
