# Dùng CreatorRoom local và chia sẻ sau khi đổi mạng

## Trạng thái hiện tại

Theo quyết định của người dùng, giữ **http://localhost:3000** hoạt động trước. TideCloak chạy tại **http://localhost:8080** trong Docker trên máy host. Chưa có link HTTPS nhiều máy dùng được: Cloudflare edge mất kết nối/hostname trả NXDOMAIN, SSH tunnel cũng timeout. Chưa xác nhận luồng đăng nhập nhiều máy; không gửi link tunnel cũ cho nhóm.

Chỉ máy host cần Node/Docker. Người dùng cuối đăng ký hoặc đăng nhập bằng browser, không tải Tide. Tài khoản mới là member: sở hữu project của mình và review draft khác khi được mời.

## Setup một lần trước khi có thành viên mới

Admin đã duyệt bật đăng ký. Thành viên bấm Create account để tạo tài khoản realm; sau đó cần hoàn tất liên kết Tide. Nếu tài khoản đã tồn tại nhưng chưa liên kết, admin vào **Approvals → Member account linking → Prepare Tide link**, ký đúng các bước adoption/invitable, rồi copy link riêng cho người dùng mở trong profile của họ. Không tạo lại account hoặc dùng danh tính Tide admin cho member. Xem `TIDECLOAK.md` để biết bước khôi phục đầy đủ.

## Thử ngay trên máy host

1. Mở localhost:3000 bằng browser profile của A; đăng nhập, lưu tên, tạo project và mở project room.
2. Upload một ảnh/TXT nhỏ tối đa 1 MB. Nếu chờ policy, admin nhóm vào **Approvals** và ký trong browser Tide của chính họ. A bấm Refresh access rồi Continue upload, chọn lại file.
3. Chọn draft đã hoàn tất, tạo link. Mở link bằng browser profile B, đăng nhập/đăng ký và Accept.
4. A đối chiếu mã tài khoản của B qua kênh quen thuộc rồi Confirm recipient. Display name có thể trùng hoặc bị giả mạo.
5. Admin duyệt requests; B mở draft và gửi feedback. B có thể tạo project riêng cùng lúc.
6. Hủy link/grant chặn API tương lai; policy đã copy có thể còn hiệu lực đến expiry, nội dung đã đọc không thể thu lại.

Link dùng một lần, hết hạn nhận sau 24 giờ, chỉ dành cho các draft đã chọn. Draft mới không tự chia sẻ. Nếu request bị từ chối, owner hủy/tạo lời mời mới sau khi trao đổi với admin. Lời mời hoặc request chờ không đồng nghĩa đã có quyền.

Demo mode là harness khác: các persona chia sẻ IndexedDB trong cùng browser. Hai browser không chia sẻ khóa demo; dùng Tide mode cho thử nhiều danh tính thật.

## Khởi động lại local khi cần

Từ thư mục repo, giữ `.env` và adapter local đã có, không ghi đè bằng file mẫu:

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:Path"
docker compose --env-file .env.tide.local -f docker-compose.tide.yml up -d
npm run build
npm start
```

Chỉ một app process dùng cùng JSON data. Nếu port 3000 đã có app, dùng app đang chạy hoặc dừng đúng process đó trước. Không xóa volume, realm hoặc dữ liệu chỉ để restart.

## Sau khi mạng đã đổi — chưa nghiệm thu

Dùng tunnel HTTPS đến `http://127.0.0.1:3000`; không tunnel trực tiếp port admin 8080. Có thể cài [Cloudflare Tunnel chính thức](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/). Quick Tunnel có URL tạm thời và không có bảo đảm uptime.

Giữ app local đang chạy để health check hoạt động. Trong PowerShell khác:

```powershell
.\scripts\start-share.ps1 -CloudflaredPath 'C:\path\to\cloudflared.exe'
```

Nếu tunnel đã có và log thuộc lần hiện tại, dùng `-UseExistingTunnel`. Nếu đã có URL HTTPS chuyển tiếp đúng app, dùng `-PublicOrigin 'https://your-host.example'` thay vì tạo Cloudflare tunnel.

Script kiểm tra DNS và `/api/health` trước khi đổi `.env`, adapter hoặc Docker. Khi kiểm tra thất bại, tiếp tục dùng localhost; không đổi DNS/hosts hoặc bỏ HTTPS để vượt lỗi. Nếu thành công, script backup local config, đặt external hostname cho broker và bật proxy thành viên. Dừng đúng app process rồi build/start lại một process duy nhất.

Admin mở **http://localhost:3000/#/approvals**, bấm **Enable shared sign-in in Tide**, duyệt thay đổi client và ký lại IdP trong browser. Chỉ chia sẻ URL sau khi app báo sẵn sàng và đăng nhập thử thành công từ máy khác. URL mới phải cập nhật redirect URIs, web origin, signed origin và adapter đồng nhất. Đổi tunnel có nghĩa cần làm lại bước cấu hình này.

Proxy chỉ cho phép realm thành viên hiện tại và public resources; toàn bộ `/admin/` và master realm bị chặn. Admin duyệt từ workspace localhost trên máy host, dùng broker loopback. Không đưa mật khẩu master admin, proxy admin hoặc token của người khác lên public endpoint.

## Quay lại local nếu thử chia sẻ thất bại

Dừng đúng app process. Nếu script đã tạo backup, khôi phục **backup local của deployment này**:

```powershell
Copy-Item -LiteralPath '.env.before-share.local' -Destination '.env' -Force
Copy-Item -LiteralPath 'data/tidecloak-local.json' -Destination 'data/tidecloak.json' -Force
docker compose --env-file .env.tide.local -f docker-compose.tide.yml up -d
node scripts/resign-idp.mjs
npm run build
npm start
```

Script `resign-idp.mjs` chỉ dành cho operator trên host, đọc ignored `.env.tide.local` và ký lại settings qua loopback; web app không import script này. Kiểm tra issuer quay lại localhost:8080 và app login không có lỗi. Không xóa Docker volume. Backup chỉ tạo lần đầu: nếu cấu hình local đã thay đổi từ lần trước, cập nhật backup đúng bản local trước khi thử tiếp.

Không commit `.env*` local, adapter thật, logs, tokens, dữ liệu hoặc tác phẩm riêng. Cả khâu ký/encrypt/decrypt Tide thật và HTTPS hai máy cần ghi bằng chứng riêng trong `VALIDATION.md`.
