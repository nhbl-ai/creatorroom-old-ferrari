# Thiết lập TideCloak cho CreatorRoom

## Trạng thái thực tế

Code đã có đường đăng nhập, xác minh token, ký policy theo người nhận và asset, mã hóa/giải mã bằng SDK Tide thật. Docker local và realm `creatorroom` đã được thiết lập trên máy quản trị, tài khoản quản trị đã liên kết Tide. Adapter local nằm trong `data/tidecloak.json` và không được commit. **Chưa kiểm chứng end-to-end mã hóa/chia sẻ trên ORK thật**; demo local là một đường riêng, không chứng minh bảo vệ Tide.

Đọc [Quickstart chính thức](https://docs.tide.org/get-started/Tidecloak%20Quickstart) và [reference Relationship Attestation](https://github.com/tide-foundation/raziel-mcp/blob/master/reference-apps/relationship-attestation/scenario.md). Với mentor Tide, xác nhận network có built-in **`RelationshipAttestation:1` phiên bản hỗ trợ User subject và policy expiry**. Không tự thay bằng self-encryption hoặc một custom contract khi network chưa hỗ trợ.

## 1. Chạy ứng dụng local trước

```bash
npm ci
npm run demo
```

Mở `http://localhost:3000`. Dùng cùng một browser/profile để chuyển các vai trò demo. Creator bấm **Load sample workspace**, mở draft rồi vào **People & access → Invite reviewer**. Chuyển sang reviewer để đọc và góp ý; chuyển operator để xem storage.

Trong mode này danh tính là giả lập, key AES-GCM không export được lưu ở IndexedDB của browser. Mọi persona demo dùng cùng kho key: người có DevTools hoặc cùng browser có thể truy cập kho này. Đây là harness phát triển, không phải mô hình bảo vệ người dùng thật. Server chỉ bind loopback. Không triển khai mode demo cho người dùng ngoài máy.

## 2. Chuẩn bị môi trường Tide

- Node.js từ 22.12; nhóm nên thống nhất dùng cùng phiên bản.
- Docker Desktop đang chạy, có mạng tới Tide Fabric.
- Một bạn quản lý realm và thực hiện Tide enrollment trong browser.

Trên Windows PowerShell, sao chép file mẫu, thay mật khẩu placeholder bằng mật khẩu local của bạn:

```powershell
Copy-Item .env.tide.example .env.tide.local
notepad .env.tide.local
docker compose --env-file .env.tide.local -f docker-compose.tide.yml up -d
docker compose --env-file .env.tide.local -f docker-compose.tide.yml logs --tail 80
```

Compose này chỉ khởi động dev server, không tự tạo realm, nhận điều khoản, cấp licence hoặc gán roles. Mật khẩu và volume không được commit.
Compose có service `tidecloak-data-init` để cấp quyền ghi UID 1000 cho named volume H2 trước khi server chạy. Service init kết thúc `Exited (0)` là bình thường; service `tidecloak` phải ở trạng thái `Up`. Bước này không xóa cơ sở dữ liệu.

Nếu vừa cài Docker mà PowerShell báo `docker is not recognized`, mở một PowerShell mới. Nếu terminal nằm trong app đang mở từ trước lúc cài Docker, có thể cần mở lại app đó hoặc cập nhật PATH cho riêng cửa sổ hiện tại:

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:Path"
docker --version
docker compose version
```

Đường dẫn trên dành cho Docker Desktop cài per-user. Với bản all-users, dùng `C:\Program Files\Docker\Docker\resources\bin`. Thêm cả thư mục vào PATH cũng giúp Docker tìm được credential helper khi tải image.

## 3. Bootstrap realm và hoàn tất enrollment

Làm theo initializer trong Quickstart. Nếu dùng `npm init @tidecloak/nextjs@latest`, tạo template thử trong một thư mục riêng, **không ghi đè source CreatorRoom**. CreatorRoom hiện dùng React/Vite + Express, không cần thay bằng app Next.js được sinh ra.

Khi công cụ yêu cầu email quản lý licence và chấp nhận [điều khoản Tide](https://tide.org/legal), người quản lý tự đọc và quyết định; repository này không tự chấp nhận thay bạn. Mở URL enrollment, liên kết tài khoản Tide và chờ initializer hoàn tất. Realm cần được licensed, kết nối ORKs và bật IGA; hoàn tất các change request của bootstrap theo hướng dẫn/mentor.

## 4. Cấu hình public client cho ứng dụng

Dùng một public OIDC client trong realm (tên gợi ý `creatorroom`):

- Client authentication: **Off**, Authorization Code/Standard flow bật; SDK dùng PKCE S256.
- Valid redirect URIs: `http://localhost:3000/` và `http://localhost:3000/silent-check-sso.html`.
- Web origins: `http://localhost:3000`.
- Post-logout redirect: `http://localhost:3000/`.
- Mapper `tideuserkey` và `vuid` có trong credential/access token; user phải liên kết Tide account.
- Token của creator/admin phải mang `resource_access.realm-management.roles` cho quyền quản trị Tide. Kiểm tra scope/mappers nếu claim này thiếu; không bỏ kiểm tra ở backend.
- Bật `dpop.bound.access.tokens=true` trên client. SDK khởi tạo `useDPoP: { mode: "strict", alg: "ES256" }`; mọi API đã đăng nhập dùng `IAMService.secureFetch` với URL tuyệt đối.
- Backend xác minh chữ ký token EdDSA bằng `jwk` nhúng trong adapter, rồi kiểm tra DPoP: chữ ký proof, thumbprint khóa, hash token, method, URL, thời gian và replay. Token bound gửi dưới dạng Bearer bị từ chối.
- Relay `/tide_dpop/iss/<hex>/aud/<hex>/tide_dpop_auth.html` được SDK phục vụ đúng byte, CSP theo hash SDK và `Allow-CSP-From: *`. Không sửa hoặc format `public/tide_dpop_auth.html`.
- Bộ nhớ chống replay chỉ dành cho một tiến trình; triển khai nhiều instance cần kho jti dùng chung. Backend dùng `APP_ORIGIN` cố định để kiểm tra URL, không tin header forwarded do client gửi.

Các thay đổi trên realm đã bật IGA có thể cần approvals. Dùng cùng origin xuyên suốt: **localhost và 127.0.0.1 không phải cùng browser origin**. Khi dùng domain/port khác, cập nhật client, adapter và `APP_ORIGIN` tương ứng.

## 5. Tạo và gán roles cho ba tài khoản

| Tài khoản | App role (realm) | Tide roles (realm) | Quyền quản trị Tide |
|---|---|---|---|
| Creator | `creatorroom_creator` | `_tide_enabled`, `_tide_encryptor`, `_tide_decryptor` | Client role `tide-realm-admin` trong **`realm-management`** |
| Reviewer | `creatorroom_reviewer` | `_tide_enabled`, `_tide_encryptor`, `_tide_decryptor` | Không |
| Operator | `creatorroom_operator` | `_tide_enabled` nếu cần đăng nhập | Không |

`_tide_encryptor` và `_tide_decryptor` là tên cố định của built-in contract; không đưa hai role đó vào default composite cho tất cả mọi người. Reviewer cần quyền encrypt vì góp ý cũng được mã hóa. API chỉ cho owner ghi file gốc; crypto policy cho reviewer đọc và mã hóa góp ý của đúng record.

Creator kiêm Tide admin là **giới hạn phạm vi MVP**, không phải yêu cầu rằng mọi creator của sản phẩm hoàn chỉnh nên có quyền quản trị realm. Trong bản thực tế nên tách yêu cầu mời khỏi bước phê duyệt của admin/quorum.

Approve và commit các role assignments qua IGA theo hướng dẫn Tide, rồi refresh credential/đăng nhập lại. Cấp role mới và thu hồi quyền đang dùng là hai vấn đề khác nhau: không dùng việc đăng nhập lại để che độ trễ thu hồi.

Operator phải là tài khoản riêng, không có Tide admin hoặc encrypt/decrypt roles. Một người có đủ quyền quản trị Tide vẫn có thể đề nghị tự cấp quyền; muốn ngăn một admin làm việc đó đơn phương cần cấu hình quorum và kiểm thử riêng. MVP chưa chứng minh bảo vệ trước một quorum thông đồng hoặc một ứng dụng client độc hại.

## 6. Export adapter và nối với CreatorRoom

Export **public client adapter JSON** từ TideCloak. Giữ `vendorId`, `homeOrkUrl` nếu có, `jwk`/JWKS theo cấu hình đã ký và đặc biệt `client-origin-auth-http://localhost:3000`. Lưu file vào `data/tidecloak.json` (được gitignore).

Không dùng adapter chứa `credentials`, client secret hoặc private key. `/api/config` chỉ đưa các trường public được cho phép ra browser; backend dùng adapter để xác minh issuer, client và chữ ký token.

```powershell
Copy-Item .env.example .env
```

Chỉnh đường dẫn trong `.env` nếu cần, dừng demo rồi chạy:

```bash
npm run dev
```

Không truyền `--demo`. Khi adapter chưa tồn tại ứng dụng hiện trang setup và từ chối API nghiệp vụ; không tự chuyển sang danh tính giả.

## 7. Kiểm chứng đường Tide thật

1. Reviewer đăng nhập một lần để đăng ký `sub` và `tideuserkey` đã được xác minh với API, rồi đăng xuất. Nên dùng hai browser/profile riêng cho hai người trong mode Tide.
2. Creator đăng nhập, tạo project và upload một ảnh nhỏ.
3. Upload mở quy trình ký policy cho chính creator trong Tide enclave. Phê duyệt bằng credential của admin; server không ký và không phê duyệt thay.
4. Mở ảnh vừa upload, xác nhận giải mã được.
5. Vào **People & access**, chọn reviewer và thời hạn 1 hoặc 24 giờ. Phê duyệt policy riêng cho reviewer trong enclave.
6. Reviewer mở cùng asset và gửi góp ý. Creator đọc được góp ý sau khi giải mã.
7. Reviewer thử asset B không được mời: API phải trả 403. Thử trực tiếp với policy không đúng record/người nhận để xác nhận **network cũng từ chối**, không chỉ API.
8. Operator mở Storage inspector: chỉ thấy ciphertext, không có plaintext hoặc key. Gọi `/api/assets/<id>/open` phải nhận 403.
9. Kiểm tra request, log và file JSON: không có bytes ảnh gốc hoặc nội dung góp ý đọc được.
10. Xác nhận policy expiry trên chính network. Một policy đã copy không bị thu hồi chỉ vì xóa row trong app.

Đánh dấu kết quả vào `docs/VALIDATION.md`. Chỉ gọi tích hợp đã kiểm chứng khi có cả lượt thành công và các lượt bị từ chối trên network thật.

## 8. Vì sao không dùng self-encryption cho chia sẻ?

`doEncrypt(data)` không có policy gắn ciphertext với người mã hóa. Gán cùng role `selfdecrypt` cho reviewer không làm họ đọc được. CreatorRoom dùng `IAMService.doEncrypt(data, signedPolicyBytes)` và `doDecrypt` tương ứng.

Mỗi policy dùng `RelationshipAttestation:1`, User subject là `tideuserkey` của người nhận, `assignmentId` là asset ID, và **asset ID là tag duy nhất**. Ký policy phải đi đủ initialize → approve trong browser → đính signed admin policy → execute → đính chữ ký vào policy. Code dùng bộ serialize của SDK.

Server kiểm tra cấu trúc, scope, signature presence và expiry của policy. **Server không tự xác minh chữ ký VVK của policy**; network là nơi thực thi kiểm tra mật mã. Không gọi việc kiểm tra cấu trúc ở server là chứng minh policy đã ký hợp lệ.

## Lỗi thường gặp

| Lỗi | Cần kiểm tra |
|---|---|
| Login được nhưng API 403 về role | App role phải có trong token, operator không được dùng chung persona creator |
| Creator không được ký policy | `tide-realm-admin` là client role dưới `realm-management`, không chỉ là realm role cùng tên |
| Không có reviewer trong danh sách | Reviewer chưa đăng nhập app hoặc thiếu `tideuserkey` mapper |
| Không có signed admin policy | Enrollment/IGA bootstrap chưa xong; kiểm tra với Tide mentor |
| Encrypt/decrypt không hoạt động | `vendorId`, origin auth, voucher/realm roles và credential đã cập nhật |
| Network báo threshold failure | Có thể contract từ chối; đọc cause trước khi coi là outage và retry |
| Unknown contract/version | Network chưa hỗ trợ built-in contract/policy expiry; nhờ Tide xác nhận, không tự đổi byte format |
| Mở lại demo báo thiếu key | Đang dùng browser/profile khác hoặc IndexedDB bị xóa; dùng browser gốc hoặc upload mẫu mới |

Nguồn kỹ thuật: [Tide SDK](https://github.com/tide-foundation/tidecloak-js), [policy signing helper](https://github.com/tide-foundation/raziel-mcp/blob/master/templates/relationship-attestation/relationship.ts), [role matrix](https://github.com/tide-foundation/raziel-mcp/blob/master/reference-apps/relationship-attestation/role-policy-matrix.md).

## Hồ sơ và giao diện đăng nhập

Người quản trị chọn branding CreatorRoom (cam `ed6a43`) và chỉ hỏi tên hiển thị. Artwork được sinh bởi script Tide, nằm trong `branding/`. Logo/background được upload và ký lại trong IdP trên realm local; public URLs không chứa thông tin riêng tư.

`src/components/ProfileOnboarding.jsx` hỏi tên sau đăng nhập, cho phép bỏ qua và mở lại bằng cách bấm tên ở góc trên. Tên được lưu vào `firstName` qua Account API bằng DPoP/token của chính người dùng, không dùng Admin API. Không tự tạo email. Cơ chế `idp-review-profile` đã được tắt trên realm để tránh form chặn người dùng trước app.
