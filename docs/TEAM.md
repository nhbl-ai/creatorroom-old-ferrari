# Handoff cho HCMUS - Old Ferrari

## Code đã có

- Giao diện project, upload, review room, feedback và storage inspector responsive.
- API kiểm tra session/JWT và quyền theo từng asset; không nhận plaintext upload/feedback.
- Demo local dùng danh tính giả lập và WebCrypto; ba persona chuyển trong cùng browser.
- Đường SDK Tide cho đăng nhập, ký relationship policy và mã hóa/giải mã.
- Test API, JWT và browser workflow. Chưa kiểm chứng realm/ORK thật.

## Các đầu việc nhóm cần nhận tiếp

| Đầu việc | Người nhận | Đầu ra |
|---|---|---|
| Tide setup và live acceptance | Nhóm tự nhận | Theo `TIDECLOAK.md`: realm, roles, adapter, sign/encrypt/decrypt giữa hai browser và network từ chối sai người/asset |
| Kiểm thử độc lập | Nhóm tự nhận | Chạy test, thử file riêng, thử đổi ID/gọi API, kiểm tra storage và giới hạn expiry |
| Trải nghiệm review | Nhóm tự nhận | Kiểm tra wording, luồng mời, lỗi thực tế khi Tide popup bị chặn; tránh thay cả file App cùng lúc |
| README và demo video | Nhóm tự nhận | Cập nhật claims theo live evidence, quay 120 giây, MP4 dưới 100 MB và nộp form |

Đây là đề xuất để nhóm nhận, không tự đổi phân công C1. Không cần GPU cho CreatorRoom.

## Bắt đầu làm

```bash
git clone https://github.com/nhbl-ai/creatorroom-old-ferrari.git
cd creatorroom-old-ferrari
npm ci
npm run demo
```

Khi pull code mới, chạy lại `npm ci` nếu lockfile thay đổi. Mỗi người dùng nhánh riêng và PR vào `main` theo `CONTRIBUTING.md`. Không push `.env`, adapter thật, JSON runtime hoặc tác phẩm thật lên repo public.

Các file nên chia theo đầu việc: tích hợp trong `src/lib/` và `server/auth.js`; API trong `server/app.js`; giao diện trong `src/App.jsx` và `src/styles.css`; bài nộp trong `README.md`, `docs/`, `demo/`.
