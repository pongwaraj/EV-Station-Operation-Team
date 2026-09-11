export function inputDate(value: string) {
  return new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 10);
}
export function rangeLabel(range?: { from: string; to: string }) {
  if (!range) return "";
  const format = (value: string) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(value));
  return `ข้อมูลที่แสดง: ${format(range.from)} – ${format(range.to)} · เวลาไทย`;
}
