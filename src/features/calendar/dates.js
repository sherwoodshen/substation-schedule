export function todayDate() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-');
}

export function shiftMonth(month, offset) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function daysInMonth(month) {
  const date = new Date(`${month}-01T00:00:00Z`);
  const leading = (date.getUTCDay() + 6) % 7;
  date.setUTCMonth(date.getUTCMonth() + 1, 0);

  return [
    ...Array(leading).fill(null),
    ...Array.from({ length: date.getUTCDate() }, (_, index) => (
      `${month}-${String(index + 1).padStart(2, '0')}`
    )),
  ];
}
