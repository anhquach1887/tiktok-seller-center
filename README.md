# ROI Guard

Web Next.js **16.4.3**, React **19.3.1**, Node.js **26.13.0**. Backend gọi trực tiếp API Seller Center; không cần Chrome MCP, agent local hay trình duyệt đang mở khi vận hành.

**Deploy Vercel gói free:** xem [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md). Bản này hỗ trợ Neon Postgres và GitHub Actions gọi `/api/cron` mỗi 5 phút để chạy khi bạn offline. Không dùng SQLite hay tiến trình worker thường trực trên Vercel. `vercel.json`, workflow và `schema.sql` đã có sẵn.

## Chạy local

```powershell
npm install
npm test
npm run dev
```

Mở http://127.0.0.1:3000. Khi chưa đặt `DASHBOARD_PASSWORD` ở development, để trống mật khẩu dashboard. Có thể double-click `install-web.cmd` để cài và build; `start-dev.cmd` để mở dev server.

Muốn kiểm tra tự động khi phát triển, mở terminal thứ hai và chạy `npm run worker`. Dùng cùng thư mục và cùng biến môi trường với web. Dev server không tự khởi động scheduler.

## Kết nối tài khoản

**Nhập nhanh:** trong Chrome Network, chuột phải request `post_campaign_list_v2` → Copy → Copy as cURL. Dán vào ô **Nhập nhanh bằng cURL**, bấm **Lấy thông tin từ cURL**, rồi **Kiểm tra & kết nối**. Hỗ trợ định dạng bash/cmd và dấu xuống dòng PowerShell; tự lấy cookie, Advertiser ID, Seller ID. Nội dung được phân tích ngay trong browser, không thực thi lệnh cURL, không gửi request body/header khác lên server. Ngày trong cURL được bỏ qua; dữ liệu vẫn luôn lấy Today UTC+7.

Hoặc nhập từng trường thủ công:

1. Tự đăng nhập https://seller-vn.tiktok.com/ads-creation/dashboard bằng tài khoản có quyền quản lý quảng cáo.
2. F12 → Network → tải lại trang → tìm `post_campaign_list_v2`.
3. Trong Headers, sao chép Request URL. Dán vào Kết nối để tự lấy `aadvid` và `oec_seller_id`.
4. Sao chép **giá trị Cookie** từ Request Headers, không bao gồm tiền tố `Cookie:`. Dán vào ô cookie rồi Kiểm tra & kết nối. Server chỉ lưu nếu request API danh sách thành công.

Đây là kết nối bằng phiên Seller Center, không phải OAuth. Không cần App ID/App Secret. Phiên có thể hết hạn hoặc bị TikTok từ chối trên IP server; khi đó công cụ báo lỗi, dừng tự động và yêu cầu kết nối lại. Không có cơ chế vượt CAPTCHA, xác minh thiết bị hoặc hạn chế truy cập.

Cookie chỉ được gửi từ form tới backend cùng origin, mã hóa AES-256-GCM trước khi lưu SQLite; không gửi lại cho frontend, không ghi vào log. Mỗi browser dashboard có phiên riêng, cookie HTTP-only và dữ liệu riêng. Mật khẩu dashboard là mật khẩu truy cập website do chủ host đặt, không phải mật khẩu TikTok. Logout xóa kết nối, lịch và dữ liệu của phiên đó. Xóa cookie trình duyệt sẽ mất quyền truy cập phiên cũ; đây chưa phải hệ thống tài khoản có khôi phục mật khẩu.

## Quy tắc và tự động

- Chỉ Product GMV Max; chưa hỗ trợ LIVE GMV Max.
- Ngày luôn tính bằng `Asia/Ho_Chi_Minh`, không lấy ngày cố định trong link.
- ROI thực tế = `onsite_roi2_total_cost_shopping`. Không dùng `template_ad_roas_bid` (ROI mục tiêu).
- Mặc định ROI < 5, chi phí tối thiểu 0đ, bỏ qua camp chưa chi tiêu, chu kỳ 15 phút.
- X = ROI sẽ giữ nguyên. ROI thiếu, trạng thái không rõ, camp đã tắt sẽ được bỏ qua.
- Đọc đủ phân trang trước khi lập danh sách. Bản xem trước hết hạn sau 2 phút, chỉ được gửi một lần.
- Người dùng chọn camp và xác nhận trước khi tắt thủ công. Tự động chỉ chạy sau khi được bật rõ ràng, lượt đầu sau một chu kỳ.
- Mỗi camp được đọc lại trước lệnh tắt và xác minh trạng thái sau lệnh; không tự gửi lại write khi timeout. Nếu kết quả chưa rõ, ghi log và tắt tự động.
- Chỉnh quy tắc/kết nối sẽ tắt tự động. Tự động đã bật được lưu bền vững và tiếp tục chạy sau khi server khởi động lại.
- Dừng tự động chặn các camp tiếp theo, không thu hồi request đã gửi.

## API đã xác định

| Mục đích | Endpoint |
| --- | --- |
| Danh sách | `POST /oec_ads/shopping/v1/oec/stat/post_campaign_list_v2` |
| Trạng thái | `POST /oec_ads/shopping/v1/creation/campaign/update_status` |

Query scope: `aadvid`, `oec_seller_id`, `language=vi`, `locale=vi`. Auth: Cookie + `X-CSRFToken` lấy từ `csrftoken` trong cookie.

Payload tắt:

```json
{"campaign_list":["CAMPAIGN_ID"],"operation":2}
```

Mã trang TikTok định nghĩa operation **1 = bật, 2 = tắt, 3 = xóa**. Web chỉ triển khai thao tác tắt, không cung cấp xóa hay tự bật lại.

**Mức xác minh:** API danh sách được gọi thành công trong phiên Chrome thật với 50 chiến dịch. Endpoint và enum bật/tắt được đọc từ bundle Seller Center. Chưa gửi lệnh tắt lên tài khoản thật. Test tự động dùng phản hồi giả lập để kiểm tra payload, điều kiện và xác minh trạng thái. Cần thử với một camp được phép tắt trước khi bật tự động production.

## Host trên Node/Docker

Đây là ứng dụng Node, không phải static export. Trên Vercel dùng Neon Postgres và endpoint cron theo hướng dẫn riêng ở trên. Trên VPS/container có thể dùng SQLite với ổ đĩa bền vững, cùng `DATA_DIR` và `APP_SECRET` cho web/worker; không chia sẻ SQLite giữa nhiều máy.

```powershell
# Tạo khóa một lần; lưu an toàn, không đổi nếu còn dùng dữ liệu đã mã hóa.
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Sao chép `.env.example` thành `.env`, điền `APP_SECRET`, `DASHBOARD_PASSWORD`, `APP_ORIGIN=https://domain-cua-ban`. Không đưa `.env` vào Git.

Docker Compose tự đọc `.env`:

```sh
docker compose up -d --build
```

Đặt reverse proxy HTTPS phía trước `127.0.0.1:3000`. `APP_ORIGIN` phải khớp origin trình duyệt (không có dấu `/` cuối). Docker chạy web và worker bằng `npm start` và lưu dữ liệu vào volume `roi-data`.

Host Node trực tiếp: cài dependency, `npm run build`, tạo `.env` rồi `npm start`. Lệnh start và worker đều nạp file env bằng Node 26; biến đã đặt ở process manager được ưu tiên. `npm start` chạy cả web và scheduler, dừng cả hai khi một tiến trình thoát.

Sao lưu cả volume dữ liệu **và APP_SECRET**. Bản build hiện pin Next/React; khi nâng phiên bản, kiểm tra bản vá và tạo lại lockfile bằng `npm install`.
