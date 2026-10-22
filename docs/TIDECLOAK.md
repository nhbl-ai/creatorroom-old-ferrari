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
- Token của người duyệt admin phải mang `resource_access.realm-management.roles` cho quyền quản trị Tide. Kiểm tra scope/mappers nếu claim này thiếu; không bỏ kiểm tra ở backend.
- Bật `dpop.bound.access.tokens=true` trên client. SDK khởi tạo `useDPoP: { mode: "strict", alg: "ES256" }`; mọi API đã đăng nhập dùng `IAMService.secureFetch` với URL tuyệt đối.
- Backend xác minh chữ ký token EdDSA bằng `jwk` nhúng trong adapter, rồi kiểm tra DPoP: chữ ký proof, thumbprint khóa, hash token, method, URL, thời gian và replay. Token bound gửi dưới dạng Bearer bị từ chối.
- Relay `/tide_dpop/iss/<hex>/aud/<hex>/tide_dpop_auth.html` được SDK phục vụ đúng byte, CSP theo hash SDK và `Allow-CSP-From: *`. Không sửa hoặc format `public/tide_dpop_auth.html`.
- Bộ nhớ chống replay chỉ dành cho một tiến trình; triển khai nhiều instance cần kho jti dùng chung. Backend kiểm tra URL theo `APP_ORIGIN` và danh sách `APP_ADDITIONAL_ORIGINS` đã cấu hình, không tin header forwarded do client gửi.

Các thay đổi trên realm đã bật IGA có thể cần approvals. Dùng cùng origin xuyên suốt: **localhost và 127.0.0.1 không phải cùng browser origin**. Khi dùng domain/port khác, cập nhật client, adapter và `APP_ORIGIN` tương ứng.

## 5. Thành viên, người duyệt và operator

Mọi người đăng ký/đăng nhập bằng trình duyệt tại CreatorRoom; **không cài Tide hoặc Docker trên máy của từng thành viên**. Trong mode Tide, một JWT hợp lệ của realm/client cho phép dùng workspace dưới vai trò `member`. Creator/reviewer là quan hệ với project/draft, không còn là hai loại tài khoản phải cấp riêng.

| Tài khoản | Quyền ứng dụng | Tide roles và quyền quản trị |
|---|---|---|
| Thành viên thường | Tạo/sửa project của mình; review draft được mời | Không có realm admin; crypto roles được người duyệt cấp khi chuẩn bị policy |
| Admin nhóm | Thành viên + hàng chờ Approvals | Client role `tide-realm-admin` trong **`realm-management`**, admin policy hợp lệ |
| Operator riêng | Storage inspector; không tạo project hoặc đọc draft | Realm role `creatorroom_operator`; không có Tide admin/encrypt/decrypt |

Người duyệt mở **Approvals** trên máy host tại `http://localhost:3000`. Khi approve, browser dùng token/DPoP của chính admin để kiểm tra và đề nghị cấp `_tide_enabled`, `_tide_encryptor`, `_tide_decryptor` cho người nhận; IGA có thể mở enclave hoặc chờ quorum. Code chỉ tự tiếp tục đúng change request vừa tạo, không duyệt hàng loạt mọi yêu cầu đang tồn đọng. Khi có conflict/pending quorum, xem **Governance**, hoàn tất yêu cầu hợp lệ rồi thử lại.

Sau đó browser ký relationship policy cho đúng người và đúng draft. Backend lưu policy và grant sau khi kiểm tra scope; admin không tự được quyền đọc file của thành viên. Không cấp `tide-realm-admin` cho người mới. Nếu cần cấu hình admin đầu tiên, dùng console local và hướng dẫn Tide; không biến role đó thành default.

Sau khi được cấp crypto roles, thành viên bấm **Refresh access** (hoặc đăng nhập lại khi cần) rồi tiếp tục upload/mở draft. Reviewer cần encrypt để góp ý được mã hóa; quyền ghi bản gốc vẫn do API giới hạn cho owner.

Một người có quyền quản trị Tide có thể đề nghị tự cấp quyền; muốn ngăn hành động đơn phương cần cấu hình và thử quorum riêng. MVP chưa chứng minh bảo vệ trước quorum thông đồng hoặc client độc hại.

### Bật đăng ký thành viên lần đầu

Landing và trang lời mời có hai hành động riêng: **Continue with TideCloak / Sign in** và **Create account**. Nút Create account dùng `getTideCloakClient().register()` của SDK, giữ route lời mời để quay lại sau đăng ký; app không nhận mật khẩu.

Realm local hiện đã bật default required action `link-tide-account-action` cho tài khoản mới. Người dùng đã phê duyệt `setRegistrationAllowed=true`; đăng ký realm hiện được bật. Đây chưa phải bằng chứng hoàn thành liên kết Tide cho thành viên mới.

Ở realm khác, admin bật **Realm settings → Login → User registration**, đảm bảo **Authentication → Required actions → link-tide-account-action** enabled và default, rồi hoàn tất đúng governance request. Không cấp role admin mặc định cho người đăng ký. Hãy thử nút Create account bằng browser profile mới, hoàn thành đăng ký realm và liên kết danh tính Tide trong browser; sau đó quay lại app để chọn display name. Người dùng đã có tài khoản dùng Sign in, không tạo lại.

### Hoàn tất liên kết cho tài khoản mới đã được tạo

Kiểm thử thật cho thấy tài khoản tự đăng ký có thể tồn tại nhưng chưa có `tideUserKey` và chưa có attestation `user_identity`. Required action mặc định chưa đủ để coi onboarding hoàn tất. Không đăng ký lại hoặc dùng danh tính Tide admin để gắn vào member.

1. Admin mở `http://localhost:3000/#/approvals`, phần **Member account linking**.
2. Tìm đúng username/mã tài khoản, bấm **Prepare Tide link**.
3. Browser admin đề nghị `ADOPT_USER` nếu chưa committed, phê duyệt bằng chính phiên admin (realm multiAdmin: `ADOPT_*` đi lane `authorize` + `commit` vì `/approve` không dựng được enclave model cho adoption — lỗi `APPROVAL_MODEL_BUILD_FAILED: Unknown IGA action: ADOPT_USER`; khi chưa commit, tài khoản bị disable nên không đăng nhập được); sau đó cấp thuộc tính `tideInvitable=true` qua IGA và chờ áp dụng. Đây không cấp realm admin hoặc quyền đọc draft.
4. Nếu member đã có change request `CREATE_USER` (đăng ký lúc realm còn tắt self-registration), `ADOPT_USER` hoặc `SET_USER_ATTRIBUTE tideInvitable` đang chờ, nút này tiếp tục duyệt đúng các request đó thay vì báo kẹt. Member có request đang chờ có thể bị TideCloak tạm disable; danh sách vẫn hiển thị với trạng thái "Waiting for admin approval". Request khác của member, hoặc request của người khác, không được tự duyệt — xử lý trong **Tide governance** rồi thử lại. Nếu báo "Tide did not record tideInvitable", bật **Realm settings → User profile → Unmanaged attributes** rồi thử lại.
5. Bấm **Copy Tide link**, mở link trong browser profile của member, hoàn tất tạo/liên kết danh tính Tide riêng. Link nhạy cảm, yêu cầu hạn 30 phút, chỉ giữ trong bộ nhớ UI; không gửi log/repo hoặc mở trong profile admin.
6. Khi hiện account linked, quay lại app, bấm **Continue with TideCloak** để đăng nhập member đã liên kết; không bấm Create account lần nữa.

Danh sách admin đọc tối đa 100 user đầu tiên cho demo. Luồng chuẩn bị link có test orchestration với fixture; ký/adopt/link thực tế vẫn cần người dùng nghiệm thu. Nếu gặp `different_user_authenticated` hoặc "already authenticated as different user", dùng đúng profile của account và bắt đầu từ app/link mới, không refresh POST đăng ký cũ. Không xóa tài khoản/dữ liệu để vượt lỗi.

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

## 7. Kiểm chứng đường Tide thật — đang chờ người dùng thử

Dùng ba browser profile riêng cho owner A, member B và operator; thêm phiên admin nhóm nếu A không phải admin. Đừng dùng nút đổi persona demo để chứng minh Tide thật.

1. A đăng ký qua browser; nếu chưa liên kết Tide, admin chuẩn bị link theo mục trên, A hoàn tất liên kết trong profile riêng rồi Sign in. Lưu display name, refresh kiểm tra tên còn.
2. A tạo project P: card mở được, sửa metadata và refresh URL project được.
3. A upload ảnh nhỏ. Thành viên thường tạo reservation + policy request rồi thấy trạng thái chờ; **bytes file chưa được gửi lên server**. Admin nhóm vào Approvals và phê duyệt các bước Tide.
4. A chọn **Continue upload**, chọn lại file cùng MIME/kích thước. Browser refresh credential, dùng policy đã duyệt để mã hóa rồi gửi ciphertext. Mở lại draft và xác nhận giải mã được. Admin tự upload có thể ký policy của mình ngay trong luồng.
5. A chọn draft đã upload, tạo link một lần và gửi cho B. B mở link, đăng nhập/đăng ký, nhận lời mời; chưa có quyền đọc lúc này.
6. A đối chiếu mã tài khoản của B ngoài app (display name không phải bằng chứng danh tính), bấm xác nhận người nhận. Admin nhóm duyệt policy riêng cho từng draft.
7. B vào Shared with me hoặc mở lại link, đọc draft và gửi góp ý. A đọc được góp ý. B vẫn tạo được project Q của mình.
8. B thử draft khác không được mời: API phải từ chối. Thử policy sai người/record trực tiếp với SDK để xác nhận **network cũng từ chối**. Không chỉ kiểm tra nút ẩn.
9. Operator chỉ thấy ciphertext trong Storage inspector; `/api/assets/<id>/open` trả 403. Request/log/storage không có bytes gốc hoặc nhận xét đọc được.
10. Hủy lời mời: API từ chối ngay với phiên cũ. Kiểm tra expiry thực tế trên network; không tuyên bố xóa row thu hồi policy đã copy.

Ghi kết quả vào `docs/VALIDATION.md`. Người dùng chọn thử Tide thật sau; test tự động dùng fixture không thay thế các lượt này. Hiện giữ local; xem [hướng dẫn chia sẻ](SHARING.md) khi đổi mạng.

## 8. Vì sao không dùng self-encryption cho chia sẻ?

`doEncrypt(data)` không có policy gắn ciphertext với người mã hóa. Gán cùng role `selfdecrypt` cho reviewer không làm họ đọc được. CreatorRoom dùng `IAMService.doEncrypt(data, signedPolicyBytes)` và `doDecrypt` tương ứng.

Mỗi policy dùng `RelationshipAttestation:1`, User subject là `tideuserkey` của người nhận, `assignmentId` là asset ID, và **asset ID là tag duy nhất**. Ký policy phải đi đủ initialize → approve trong browser → đính signed admin policy → execute → đính chữ ký vào policy. Code dùng bộ serialize của SDK.

Server kiểm tra cấu trúc, scope, signature presence và expiry của policy. **Server không tự xác minh chữ ký VVK của policy**; network là nơi thực thi kiểm tra mật mã. Không gọi việc kiểm tra cấu trúc ở server là chứng minh policy đã ký hợp lệ.

## Lỗi thường gặp

| Lỗi | Cần kiểm tra |
|---|---|
| Login được nhưng API 403 | Kiểm tra owner/grant của draft; operator không dùng chung persona thành viên. Member thường không cần role creator/reviewer |
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

`src/components/ProfileOnboarding.jsx` hỏi tên sau đăng nhập, cho phép bỏ qua và mở lại bằng cách bấm tên ở góc trên. Tên được lưu qua `PATCH /api/profile` vào hồ sơ ứng dụng theo `sub` đã xác minh, bằng DPoP/token của chính người dùng. Không dùng Account API để tránh validation email của realm; không tự tạo email, không cập nhật role hoặc danh tính từ form. Cơ chế `idp-review-profile` đã được tắt trên realm để tránh form chặn người dùng trước app.
