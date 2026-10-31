import { parseRows, qualifies, vietnamDate } from './rules.mjs';
const ORIGIN = 'https://seller-vn.tiktok.com';
export const LIST_PATH = '/oec_ads/shopping/v1/oec/stat/post_campaign_list_v2';
export const STATUS_PATH = '/oec_ads/shopping/v1/creation/campaign/update_status';
export function validateConnection(input) {
  const { cookie, advertiserId, sellerId } = input || {};
  if (typeof cookie !== 'string' || cookie.length < 10 || cookie.length > 50000 || /[\r\n]/.test(cookie)) throw new Error('Cookie phiên không hợp lệ.');
  if (!/^\d{10,25}$/.test(advertiserId || '') || !/^\d{10,25}$/.test(sellerId || '')) throw new Error('Advertiser ID và Seller ID phải là chuỗi số hợp lệ.');
  const csrf = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('csrftoken='))?.slice(10);
  if (!csrf) throw new Error('Cookie thiếu csrftoken. Sao chép đầy đủ Cookie từ request danh sách.');
  return { cookie, advertiserId, sellerId };
}
export class TikTokApi {
  constructor(connection, fetcher = fetch, {deadline=Infinity} = {}) { this.connection = validateConnection(connection); this.fetcher = fetcher; this.deadline=deadline; }
  async post(path, body) {
    if (![LIST_PATH, STATUS_PATH].includes(path)) throw new Error('Endpoint không được hỗ trợ.');
    const { cookie, advertiserId, sellerId } = this.connection;
    const csrf = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('csrftoken=')).slice(10);
    const url = new URL(path, ORIGIN);
    const timeout=Math.min(20000,this.deadline-Date.now());
    if(timeout<1000)throw new Error('Hết thời gian xử lý của lượt chạy.');
    for (const [key, value] of Object.entries({ aadvid: advertiserId, oec_seller_id: sellerId, locale: 'vi', language: 'vi' })) url.searchParams.set(key, value);
    let response;
    try { response = await this.fetcher(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRFToken': csrf, Origin: ORIGIN, Referer: `${ORIGIN}/ads-creation/dashboard`, 'User-Agent': 'Mozilla/5.0' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout), cache: 'no-store' }); }
    catch { throw new Error(path === STATUS_PATH ? 'Kết nối gián đoạn khi gửi lệnh. Trạng thái chưa rõ; kiểm tra TikTok, không tự gửi lại.' : 'Không kết nối được TikTok từ server. Kiểm tra mạng và phiên đăng nhập.'); }
    if (!response.ok) throw new Error(`TikTok HTTP ${response.status}. Có thể cần cập nhật cookie hoặc xác minh phiên trên TikTok.`);
    let json; try { json = await response.json(); } catch { throw new Error('TikTok trả phản hồi ngoài định dạng API. Cần xác minh đăng nhập trên TikTok.'); }
    if (json.code !== 0) throw new Error(`TikTok từ chối yêu cầu (code ${String(json.code).slice(0,30)}). Kiểm tra phiên và quyền tài khoản.`);
    return json.data;
  }
  async list(date = vietnamDate()) {
    const rows = [], seen = new Set(); let total;
    for (let page = 1; page <= 100; page++) {
      const data = await this.post(LIST_PATH, {
        query_list: ['campaign_id','campaign_name','campaign_opt_status','campaign_primary_status','campaign_status','stats_total_cost','onsite_roi2_shopping_sku','onsite_roi2_shopping_value','onsite_roi2_total_cost_shopping','template_ad_roas_bid'],
        start_time: date, end_time: date, page, page_size: 100, dims: ['campaign_id'], order_field: 'stats_total_cost', order_type: 1,
        filters: [{ field: 'external_type', filter_type: 0, in_field_values: ['304','307'] }, { field: 'campaign_status', filter_type: 0, in_field_values: ['no_delete'] }, { field: 'gmv_roi_mode', filter_type: 10, in_field_values: ['2'] }]
      });
      if (!Number.isInteger(data?.pagination?.total_count) || !Number.isInteger(data.pagination.page_count) || data.pagination.page_count < 0 || data.pagination.page_count > 100) throw new Error('Schema phân trang TikTok thay đổi.');
      if (total !== undefined && total !== data.pagination.total_count) throw new Error('Danh sách thay đổi trong lúc đọc. Hãy đồng bộ lại.');
      total = data.pagination.total_count;
      for (const row of parseRows(data.table_v2)) { if (seen.has(row.id)) throw new Error('API trả mã chiến dịch trùng.'); seen.add(row.id); rows.push(row); }
      if (page >= data.pagination.page_count) { if (rows.length !== total) throw new Error('Chưa đọc đủ chiến dịch.'); return { date, rows, fetchedAt: new Date().toISOString(), advertiserId: this.connection.advertiserId, sellerId: this.connection.sellerId }; }
    }
    throw new Error('Vượt giới hạn phân trang.');
  }
  async pause(id, rule, date) {
    if (date !== vietnamDate()) throw new Error('Ngày đã thay đổi. Đồng bộ dữ liệu hôm nay trước.');
    const before = await this.list(date);
    const row = before.rows.find(x => x.id === id);
    if (!row || !qualifies(row, rule)) return { skipped: true, id, name: row?.name || id, reason: 'Không còn thỏa điều kiện.' };
    await this.post(STATUS_PATH, { campaign_list: [id], operation: 2 });
    for (let attempt = 0; attempt < 3; attempt++) {
      const after = (await this.list(date)).rows.find(x => x.id === id);
      if (after?.statusKnown && !after.enabled) return { paused: true, id, name: row.name, roi: row.roi, spend: row.spend };
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    throw new Error(`Đã gửi lệnh cho ${row.name} nhưng chưa xác minh trạng thái tắt. Kiểm tra trực tiếp trên TikTok trước khi thử lại.`);
  }
}
