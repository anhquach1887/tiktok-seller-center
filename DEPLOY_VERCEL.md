# Deploy Vercel Hobby + lịch chạy khi bạn offline

Kiến trúc: GitHub Actions gọi `GET /api/cron` mỗi 5 phút → Vercel Function đọc cấu hình ở Neon Postgres → đọc ROI hôm nay → tắt camp đủ điều kiện → xác minh và ghi log. Không cần máy bạn online, không chạy `npm run worker` trên Vercel.

## 1. Tạo database Neon Free

1. Tạo project tại https://neon.com, chọn vùng Singapore nếu có.
2. Mở SQL Editor và chạy toàn bộ [schema.sql](./schema.sql) một lần.
3. Copy Postgres connection string ở Connect. Dùng URL đầy đủ có username/password, không đưa URL vào Git.

Neon HTTP được hỗ trợ trực tiếp, không cần cài database driver. Chỉ chấp nhận host `*.neon.tech`. SQLite chỉ dành cho local/Docker; code sẽ từ chối fallback sang SQLite khi chạy trên Vercel.

## 2. Import repository vào Vercel

- Repository: `anhquach1887/tiktok-seller-center`.
- Framework: Next.js. Root Directory: thư mục gốc repository.
- Node.js: **26.x** (Vercel tự chọn patch mới nhất; local dùng 26.13.0).
- Build: `npm run build`. Install: `npm ci`.
- Không đổi Start Command thành `npm start`; Vercel dùng Next.js Functions tự động.
- Bật Fluid Compute và cho phép function chạy tối đa 300 giây.
- Vùng function mặc định `sin1`, khai báo trong `vercel.json`.

## 3. Environment Variables trên Vercel, scope Production

| Biến | Giá trị |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string |
| `APP_SECRET` | Chuỗi ngẫu nhiên ít nhất 32 ký tự, mã hóa cookie |
| `DASHBOARD_PASSWORD` | Mật khẩu truy cập website do bạn đặt |
| `APP_ORIGIN` | Origin production chính xác, ví dụ `https://tiktok-roi.vercel.app`, không có `/` cuối |
| `CRON_SECRET` | Chuỗi ngẫu nhiên **khác APP_SECRET**, ít nhất 32 ký tự |

Tạo hai khóa riêng bằng cách chạy lệnh sau hai lần:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Không đặt tên bắt đầu bằng `NEXT_PUBLIC_` cho bất kỳ secret nào. Giữ nguyên APP_SECRET khi redeploy để đọc được cookie đã mã hóa. Sau khi thêm/chỉnh env, Redeploy. Nếu chưa biết URL project lúc tạo, deploy lần đầu để lấy URL rồi điền APP_ORIGIN và redeploy.

Không dùng chung production DATABASE_URL cho Preview nếu không muốn Preview truy cập cùng dữ liệu. `/api/cron` từ chối chạy ở môi trường Vercel Preview.

## 4. Bật lịch free trong GitHub

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Giá trị |
| --- | --- |
| `APP_URL` | `https://domain-production-cua-ban`, giống origin phía trên |
| `CRON_SECRET` | Chính xác cùng giá trị CRON_SECRET trên Vercel |

Mở Actions → **Check campaign ROI** → Run workflow. Workflow nằm trong `.github/workflows/scheduler.yml`; phải có trên nhánh mặc định `main`. Nếu GitHub hỏi Enable workflows, bật workflow đó.

Lịch `3-58/5 * * * *` chạy ở phút 03,08,13,…58 để tránh thời điểm đầu giờ. Lịch chỉ gọi server; cookie TikTok, APP_SECRET và DATABASE_URL không cần đưa vào GitHub Actions. Job không checkout mã và không ghi secret ra log.

Website production cần cho phép request từ GitHub Actions tới `/api/cron`. Nếu bật Vercel Deployment Protection cho production, cấu hình ngoại lệ phù hợp hoặc dùng domain production được phép truy cập. Không tắt xác thực CRON_SECRET trong code.

## 5. Kết nối và kiểm tra

1. Mở website, đăng nhập bằng DASHBOARD_PASSWORD.
2. Kết nối TikTok bằng Copy as cURL hoặc cookie.
3. Đồng bộ, kiểm tra dữ liệu Today và danh sách ROI < X.
4. Vào Quy tắc tự động: scheduler sẽ báo hoạt động sau khi workflow gọi endpoint thành công.
5. Đặt ROI và chu kỳ (tối thiểu 5 phút trên cấu hình cloud), lưu → Đồng bộ lại → xác nhận bật tự động.
6. Kiểm tra Actions, Vercel Function Logs và Lịch sử hoạt động sau lượt chạy đầu tiên, rồi có thể đóng trình duyệt/tắt máy.

`CRON_SECRET` được cấu hình cho phép bật tự động, nhưng chỉ có tín hiệu heartbeat mới chứng minh lịch đã gọi server. Đừng chỉ dựa vào thông báo “đã bật” để kết luận lịch đang chạy.

## Giới hạn và xử lý gián đoạn

- Vercel Hobby native Cron chỉ cho chạy một lần/ngày. Vì vậy `vercel.json` mặc định **không** khai báo lịch lặp theo phút; GitHub Actions làm bộ kích hoạt.
- GitHub schedule có thể chạy trễ hoặc bị bỏ trong lúc tải cao. Public repository không có hoạt động 60 ngày có thể bị tắt lịch tự động; cần bật lại trong Actions. Không có đảm bảo kiểm tra đúng phút hay uptime 24/7 ở cấu hình free.
- Vercel/Neon/GitHub đều có quota free và điều khoản sử dụng riêng. Theo dõi Usage; kiểm tra quảng cáo liên tục có thể dùng hết quota. Gói free không đồng nghĩa tài nguyên không giới hạn.
- Lượt cron có thời gian làm việc giới hạn, tối đa 5 phiên tài khoản được xét mỗi lượt. Camp chưa xử lý kịp được kiểm tra lại ở lượt tiếp theo. Quy tắc có chu kỳ 15 phút sẽ chỉ chạy khi đến hạn, dù cron kích hoạt mỗi 5 phút.
- Lease database chống xử lý trùng giữa nhiều function. Trước mỗi camp ghi `pending_write`. Nếu function bị kill, lượt sau dừng tự động và yêu cầu kiểm tra; không tự gửi lại lệnh có kết quả chưa rõ.
- Cookie hết hạn, TikTok đổi API hoặc chặn IP của server thì cần kết nối lại; công cụ không vượt xác minh thiết bị/CAPTCHA. Đăng nhập dashboard không gia hạn cookie TikTok.
- Mỗi trình duyệt dashboard có dữ liệu riêng, chưa có hệ thống khôi phục tài khoản nếu xóa cookie dashboard. Logout chủ động xóa phiên, dữ liệu và lịch.

## Nếu chỉ cần một lần mỗi ngày bằng Vercel Cron

Không bật GitHub workflow. Thêm vào `vercel.json` rồi deploy:

```json
"crons": [{ "path": "/api/cron", "schedule": "0 16 * * *" }]
```

Đó là khoảng 23:00 giờ Việt Nam (UTC+7), không phải đảm bảo thời điểm chính xác trên Hobby. Dùng cùng CRON_SECRET; Vercel tự gửi header Bearer. Với danh sách lớn, một lượt/ngày có thể không xử lý hết do giới hạn thời gian của function. Không bật hai lịch nếu không cần, dù code có khóa chống chạy trùng.

## Nguồn chính thức

- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- https://github.com/neondatabase/neon/blob/main/proxy/README.md#sql-over-http
