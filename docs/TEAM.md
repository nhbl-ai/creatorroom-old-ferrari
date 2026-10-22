# Handoff cho HCMUS - Old Ferrari

## Bắt đầu cùng làm

```bash
git clone https://github.com/nhbl-ai/creatorroom-old-ferrari.git
cd creatorroom-old-ferrari
npm ci
npm run demo
```

Các bạn không cần realm riêng để sửa giao diện/test demo. Với Tide thật, dùng browser vào app của host; chỉ host cần Docker và ignored adapter. Hiện dùng localhost trên host; link nhiều máy hoãn đến khi đổi mạng. Không chạy nhiều app process trên cùng JSON store.

Đọc [brif.md](../brif.md), [MVP.md](MVP.md), [TIDECLOAK.md](TIDECLOAK.md), [SHARING.md](SHARING.md). Chủ repo cấp GitHub write access theo [CONTRIBUTING.md](../CONTRIBUTING.md); mọi người dùng nhánh riêng và PR vào main. Không push `.env`, adapter thật, JSON runtime, tokens hoặc tác phẩm riêng.

## Code đã có

Project room và deep link; hồ sơ display name; mỗi member tạo project của mình; upload chờ policy/tiếp tục/hủy; link mời một lần theo draft; owner xác nhận mã tài khoản; queue admin ký; encrypted feedback; storage inspector; JWT/DPoP và proxy chặn admin public.

20 bài API/security/orchestration và 3 bài browser demo đã qua; build thành công, Tide Doctor OK (16 pass, không còn request bật signup đang chờ ký). Các fixture và persona demo không chứng minh mã hóa thật giữa hai Tide users. User chọn tự thử enclave sau. Registration đã bật; member mới chưa linked cần admin chuẩn bị Tide link trong Approvals → Member account linking. Xem phần khôi phục trong TIDECLOAK.md. Xem [VALIDATION.md](VALIDATION.md).

## Đầu việc còn lại để nhóm nhận

| Việc | Đầu ra |
|---|---|
| Nghiệm thu Tide thật | Hai browser profile: sign/encrypt/invite/read/comment; network từ chối sai người/asset; expiry, operator refusal |
| Tunnel sau đổi mạng | DNS + HTTP health, setup origin trong Approvals trên host, đăng nhập/mở draft từ máy khác |
| Kiểm thử độc lập | UI và file riêng, gọi API với ID khác, cancel/expired/rejected, tên trùng và account code |
| Video và bài nộp | Video 120 giây MP4 <100 MB trong demo/, README claims đúng live evidence, nộp Google Form |

Đây là handoff C2, không tự thay phân công Challenge 1. CreatorRoom không cần GPU.

## Chia file để giảm xung đột

| Phần | File |
|---|---|
| Tide SDK / signing / governance | `src/lib/tide.js`, `src/lib/tide-admin.js`, `src/lib/api.js` |
| API / quyền / dữ liệu | `server/app.js`, `server/collaboration.js`, `server/store.js`, `server/auth.js` |
| UI project/invite/approve | `src/components/Collaboration.jsx`, `src/App.jsx`, `src/styles.css` |
| Deploy/tunnel | `server/shared.js`, `scripts/start-share.ps1`, `docker-compose.share.yml` |
| Test / tài liệu bài nộp | `tests/`, `README.md`, `docs/`, `demo/` |

Chạy `npm test`, `npm run test:e2e` (Chromium theo README) và `npm run build` cho thay đổi ảnh hưởng luồng. Không sửa/format relay SDK `public/tide_dpop_auth.html`.
