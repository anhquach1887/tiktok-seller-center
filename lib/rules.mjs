export const DEFAULT_RULE = Object.freeze({ threshold: 5, minSpend: 0, skipZero: true, intervalMinutes: 15 });
export function validateRule(value) {
  if (typeof value?.threshold !== 'number' || !Number.isFinite(value.threshold) || value.threshold <= 0 || value.threshold > 100000) throw new Error('Ngưỡng ROI phải lớn hơn 0.');
  if (typeof value.minSpend !== 'number' || !Number.isFinite(value.minSpend) || value.minSpend < 0) throw new Error('Chi phí tối thiểu phải từ 0 trở lên.');
  if (typeof value.skipZero !== 'boolean') throw new Error('Cấu hình bỏ qua camp chưa chi tiêu không hợp lệ.');
  if (!Number.isInteger(value.intervalMinutes) || value.intervalMinutes < 1 || value.intervalMinutes > 1440) throw new Error('Chu kỳ phải từ 1 đến 1440 phút.');
  return { threshold: value.threshold, minSpend: value.minSpend, skipZero: value.skipZero, intervalMinutes: value.intervalMinutes };
}
export function qualifies(row, rule) {
  return row.enabled === true && row.statusKnown === true && Number.isFinite(row.roi) && row.roi >= 0 && Number.isFinite(row.spend) && row.spend >= rule.minSpend && (!rule.skipZero || row.spend > 0) && row.roi < rule.threshold;
}
export function vietnamDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(x => x.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function parseRows(table) {
  if (!Array.isArray(table)) throw new Error('Schema TikTok thay đổi: thiếu table_v2.');
  const number = value => typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
  return table.map(cells => {
    if (!Array.isArray(cells)) throw new Error('Schema dòng TikTok không hợp lệ.');
    const row = Object.fromEntries(cells.map(x => [x.name, x.data]));
    if (typeof row.campaign_id !== 'string' || !/^\d+$/.test(row.campaign_id)) throw new Error('Thiếu mã chiến dịch.');
    return { id: row.campaign_id, name: row.campaign_name || row.campaign_id, enabled: row.campaign_opt_status === '0', statusKnown: ['0','1'].includes(row.campaign_opt_status), status: row.campaign_status || '', roi: number(row.onsite_roi2_total_cost_shopping), spend: number(row.stats_total_cost), revenue: number(row.onsite_roi2_shopping_value), orders: number(row.onsite_roi2_shopping_sku), targetRoi: number(row.template_ad_roas_bid) };
  });
}
