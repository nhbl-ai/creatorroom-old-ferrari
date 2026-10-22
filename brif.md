# CreatorRoom — brief để thảo luận và triển khai

Ngày: 22/10/2026 · Phiên bản: 0.3 · Trạng thái: code local đã triển khai; chờ nghiệm thu Tide thật, tunnel tạm hoãn theo yêu cầu.

File giữ tên `brif.md` theo yêu cầu. Đây là đầu bài cho lần triển khai tiếp theo, không phải báo cáo rằng các chức năng bên dưới đã hoàn thành. Khi quyết định thay đổi, cập nhật file này trước khi triển khai phần phụ thuộc.

## 1. Sản phẩm cần làm

CreatorRoom là nơi chia sẻ tác phẩm chưa công bố để nhận góp ý. Người dùng tạo project, upload bản nháp và mời người khác xem đúng nội dung cần review. Nội dung tác phẩm và nhận xét phải được mã hóa trước khi gửi tới máy chủ ứng dụng.

Trải nghiệm cần giống một ứng dụng cộng tác có thể sử dụng được: đăng nhập, mở project, upload, mời, review và quản lý quyền đều có đường đi rõ ràng. Các nút và card phải có hành động hoặc giải thích vì sao chưa thể thực hiện.

## 2. Những quyết định người dùng đã chốt

| Nội dung | Quyết định |
|---|---|
| Tên sản phẩm | CreatorRoom |
| Repository | Public: https://github.com/nhbl-ai/creatorroom-old-ferrari |
| Loại tài khoản | Mọi thành viên đều có thể tạo project của mình |
| Creator / Reviewer | Vai trò theo quan hệ với project; cùng một người có thể là owner ở A và reviewer ở B |
| Hồ sơ | Chỉ hỏi tên hiển thị, có thể bỏ qua; không yêu cầu thêm email trong onboarding |
| Giao diện đăng nhập | Branding CreatorRoom |
| Cách truy cập demo | Cả nhiều tài khoản trên cùng máy và thành viên dùng máy khác |
| TideCloak hiện tại | Một máy chủ Docker local dùng chung, đã có realm và tài khoản quản trị liên kết Tide |

Không yêu cầu mỗi thành viên cài Docker hoặc TideCloak. Người dùng đăng nhập/tạo danh tính Tide bằng trình duyệt; hạ tầng do nhóm vận hành. Cần mô tả rõ bước này trong giao diện.

## 3. Hiện trạng trước lần triển khai này

- App hiện có React/Vite, Express, kho JSON, local demo, code SDK Tide, DPoP và public adapter local.
- Người dùng đã vào được workspace bằng tài khoản Tide thật. Chưa chứng minh đầy đủ luồng ký policy, mã hóa và chia sẻ giữa hai người trên network thật.
- Lưu tên hiển thị trả HTTP 400. Form hiện chỉ gửi `firstName`; realm có email bắt buộc trong profile. Cần sửa cách lưu và kiểm tra kết quả thực tế, không coi HTTP thành công là đủ.
- Project card hiện chưa mở được một trang/project room có hành động rõ ràng. Project mới có thể khiến người dùng tưởng giao diện bị treo.
- Việc đăng ký tài khoản, cấp quyền ứng dụng và mời người mới chưa thành một luồng dành cho người dùng cuối.
- Code đang phân loại creator/reviewer như role tài khoản cố định, chưa phù hợp quyết định tại mục 2.
- Creator hiện phải kiêm Tide realm admin để ký policy. Điều này cần được giải quyết bằng thiết kế phê duyệt, không cấp quyền quản trị toàn realm cho mọi thành viên.
- App và TideCloak hiện dùng localhost. Đây chưa phải bản có thể gửi link cho máy khác truy cập.

Các mục này là tồn đọng cần làm, không phải chức năng đã hoàn thành.

## 4. Mô hình quyền đích

| Người dùng trong ngữ cảnh | Được làm |
|---|---|
| Khách chưa đăng nhập | Xem landing, bắt đầu đăng ký/đăng nhập, mở link mời để tiếp tục xác thực |
| Thành viên | Quản lý hồ sơ của mình, tạo project riêng, xem lời mời dành cho mình |
| Owner của project | Mở/quản lý project của mình, upload draft, gửi yêu cầu cấp quyền và gỡ lời mời |
| Reviewer được mời | Mở draft được cấp quyền và gửi nhận xét đã mã hóa trong phạm vi đó |
| Operator | Kiểm tra trạng thái lưu trữ/ciphertext theo quyền vận hành, không tự mở tác phẩm |
| Người phê duyệt Tide | Ký các yêu cầu quản trị/policy thuộc thẩm quyền bằng phiên Tide trong trình duyệt |

Owner/reviewer phải được xác định bằng project, lời mời và danh tính đã xác minh ở backend. Không tin `role`, `ownerId` hoặc ID người nhận do browser tự khai để nâng quyền.

Operator và người phê duyệt Tide là hai quyền khác nhau. Một link mời cũng không tự thay thế policy giải mã đúng người nhận.

## 5. Luồng sử dụng cần hoàn thiện

### A. Đăng ký, đăng nhập và hồ sơ

1. Landing có hành động rõ ràng: đăng nhập và tạo tài khoản; giải thích ngắn rằng không cần cài phần mềm.
2. Đăng ký qua luồng trình duyệt Tide được hỗ trợ. Không xây kho mật khẩu riêng hoặc thu mật khẩu Tide qua server CreatorRoom.
3. Sau đăng nhập, tạo/cập nhật hồ sơ CreatorRoom theo `sub` đã xác minh, nhận `tideuserkey` khi cần policy.
4. Hỏi tên hiển thị tùy chọn, cho phép bỏ qua và sửa lại ở menu hồ sơ.
5. Thành viên mới vào được workspace; không mắc kẹt ở lỗi 403 chung chung vì thiếu role chưa được cấp.
6. Nếu cần phê duyệt quyền Tide, hiện trạng thái chờ và hành động tiếp theo. Không âm thầm cấp realm admin cho người mới.

Đề xuất: lưu tên hiển thị trong hồ sơ ứng dụng gắn với danh tính đã xác minh. Nếu tiếp tục dùng Account API của TideCloak, phải đọc hồ sơ hiện tại, giữ các trường cần thiết và xác nhận tên đã được lưu; không tạo email giả để vượt validation. Đây là lựa chọn triển khai, không cần bắt người dùng quyết định API.

### B. Tạo và mở project

1. Bấm New project, nhập tên/mô tả/màu, lưu và chuyển ngay vào project vừa tạo.
2. Project card mở bằng chuột và bàn phím; các nút con không gây click nhầm.
3. Project room có tên, mô tả, owner, danh sách draft, cộng tác viên và nút quay lại workspace.
4. Project trống có hướng dẫn và nút Upload first draft. Reviewer không thấy hành động upload của owner.
5. Owner sửa được tên/mô tả project. Không có chức năng xóa vĩnh viễn khi chưa chốt quy tắc dữ liệu.
6. Có đường dẫn mở lại project, xử lý refresh/back và thông báo rõ khi project không tồn tại hoặc không có quyền.

### C. Upload và xem draft

1. Owner chọn PNG/JPEG/WebP/TXT; UI hiển thị giới hạn kích thước trước khi chọn.
2. Hiển thị các giai đoạn thực tế: chuẩn bị quyền → chờ phê duyệt nếu cần → mã hóa → upload → hoàn tất.
3. Nếu policy chưa sẵn sàng, file chưa mã hóa không được gửi lên backend. Browser có thể yêu cầu người dùng chọn lại file sau khi quyền sẵn sàng.
4. Chỉ hiển thị upload hoàn tất sau khi lưu ciphertext thành công. Lỗi hoặc hủy không để lại draft mồ côi mà không có cách xử lý.
5. Draft mở trong review room; nội dung chỉ được giải mã cho người có quyền.
6. Draft bị khóa phải có lý do và hướng tiếp theo, không hiển thị như một card không phản hồi.

### D. Mời cộng tác viên — link một lần theo draft đã chọn

1. Owner chọn draft muốn chia sẻ và tạo link mời có thời hạn.
2. Người nhận mở link, đăng nhập/đăng ký qua trình duyệt và xác nhận nhận lời mời.
3. Link chưa được nhận không được chứa plaintext, key hoặc policy đã cấp chung cho bất kỳ ai cầm link.
4. Sau khi người nhận có danh tính/Tide key, owner xác nhận đúng người và hoàn tất cấp quyền theo luồng phê duyệt.
5. Chỉ báo Access granted khi policy cho đúng người và đúng draft đã sẵn sàng. Người nhận thấy lời mời đang chờ nếu chưa được duyệt.
6. Link hết hạn, đã dùng hoặc bị hủy phải có trạng thái rõ ràng; cùng một link không bị nhận đồng thời bởi nhiều tài khoản.
7. Gỡ lời mời chặn các yêu cầu API tiếp theo. Không tuyên bố việc này xóa dữ liệu đã đọc hoặc vô hiệu ngay policy đã sao chép còn hạn.

Đã chốt: link dùng một lần, mời vào các draft được chọn. Draft upload sau đó không tự động được chia sẻ.

### E. Review

1. Reviewer thấy project/draft đã được mời trong Shared with me.
2. Mở đúng draft, đọc nội dung và gửi nhận xét đã mã hóa.
3. Owner đọc được nhận xét sau khi giải mã.
4. Reviewer không sửa metadata/project hoặc upload bản gốc của owner.
5. Thử đổi ID, dùng lời mời sai người hoặc sai draft đều bị từ chối ở backend; kiểm chứng thêm việc network Tide từ chối policy sai phạm vi.

## 6. Đã chốt: admin nhóm ký policy trong app

Quyết định mọi thành viên được tạo project không đồng nghĩa mọi thành viên được làm Tide realm admin. Bản triển khai dùng vai trò member theo owner/project và tách canSign của admin nhóm.

**Phương án đã chốt cho demo:** có hàng chờ phê duyệt trong app. Owner gửi yêu cầu cho chính draft của mình; người quản trị nhóm ký bằng phiên Tide của họ trong trình duyệt. Thành viên thường chỉ dùng CreatorRoom. Mọi thao tác chờ ký đều có trạng thái và người chịu trách nhiệm rõ ràng.

**Phương án trải nghiệm tự phục vụ:** Creator tự duyệt trong phạm vi project của mình. Chỉ triển khai sau khi xác minh Tide hỗ trợ cách ủy quyền/policy phù hợp. Không hứa chức năng này đã có; không thay bằng cách cho mọi người quyền quản trị toàn realm, ký thay bằng mật khẩu admin trên server hoặc viết API Tide giả.

Người dùng đã đồng ý phương án admin nhóm duyệt trong app. Phương án tự phục vụ là hướng mở rộng, không thuộc lần triển khai này.

## 7. Chạy cùng máy và nhiều máy

- Cùng máy: các tài khoản dùng profile trình duyệt riêng để kiểm thử Tide thật. Demo identity switch chỉ dành cho local simulation.
- Nhiều máy: một app server và một TideCloak server dùng chung; người dùng nhận URL có thể truy cập từ máy của họ.
- Đã chốt: HTTPS tunnel tới máy hiện tại cho bản dùng chung; giữ realm Docker local, không chuyển realm sang hosting khác.
- Bản dùng chung cần HTTPS và origin/issuer/redirect URI/client-origin-auth phù hợp. Chỉ đổi localhost thành địa chỉ IP hoặc bật `0.0.0.0` chưa đủ để bảo đảm đăng nhập và WebCrypto hoạt động.
- Một deployment dùng URL chuẩn nhất quán. Không tự dựng URL xác thực từ header Host không đáng tin.
- Docker, cấu hình admin và mật khẩu chỉ ở phía vận hành. Token/key/adapter thực tế và tác phẩm riêng không được commit lên repo public.

## 8. Phạm vi ưu tiên

| Mức | Việc cần làm | Điều kiện hoàn tất |
|---|---|---|
| P0 | Hồ sơ tên hiển thị | Lưu được, tải lại vẫn còn, không tạo email giả |
| P0 | Project room | Card mở được, project mới vào được ngay, trạng thái trống có CTA upload |
| P0 | Thành viên và quyền theo project | Một người sở hữu A và review B; không tự nâng quyền |
| P0 | Onboarding/mời người mới | Không cần cài Tide/Docker, không sửa DB thủ công để nhận lời mời |
| P0 | Ký policy và upload Tide thật | Luồng ký được chốt, trạng thái chờ rõ, ciphertext round-trip thành công |
| P0 | Review và từ chối truy cập sai | Đúng người đọc/góp ý được, sai người/draft bị từ chối |
| P0 | Truy cập bản dùng chung | Hai máy mở được cùng app và hoàn thành đăng nhập theo cấu hình đã chốt |
| P0 | Kiểm thử và handoff | Test phù hợp qua, hướng dẫn đúng, commit/push repo public |
| P1 | Phiên bản draft, tìm kiếm nâng cao | Làm sau khi luồng chính đã hoạt động |
| Ngoài phạm vi hiện tại | Video lớn/streaming, DRM, thanh toán, chat thời gian thực | Không đưa vào lần hoàn thiện này |

Giữ giao diện hiện có và bổ sung trải nghiệm còn thiếu. Không cần thiết kế lại toàn bộ sản phẩm trước khi sửa luồng.

## 9. Checklist nghiệm thu

- [ ] A và B đăng nhập bằng danh tính riêng, không cần cài phần mềm trên máy người dùng.
- [ ] A lưu tên hiển thị; refresh hoặc đăng nhập lại vẫn thấy tên.
- [ ] A tạo và mở project P; sửa metadata và upload draft được.
- [ ] B tạo project Q của mình; đồng thời nhận lời mời review draft trong P.
- [ ] B mở đúng draft được mời và gửi nhận xét; A đọc lại được.
- [ ] B không mở được draft khác của A khi đổi ID hoặc dùng policy sai phạm vi.
- [ ] Tài khoản C không được mời không đọc được nội dung.
- [ ] Operator chỉ thấy ciphertext của nội dung bảo vệ, không có endpoint cấp master key/plaintext.
- [ ] Lời mời hết hạn/đã nhận/hủy hoặc chờ ký đều có thông báo và hành động tiếp theo.
- [ ] Mọi nút/card quan trọng có tương tác; lỗi có thể thử lại, loading kết thúc đúng.
- [ ] Thử được cả profile trình duyệt riêng trên cùng máy và hai máy qua URL dùng chung.
- [ ] Phân biệt rõ bằng chứng local demo, test tự động và network Tide thật trong tài liệu.

## 10. Đầu bài cho lần triển khai sau khi chốt

```text
Hoàn thiện CreatorRoom trong repository hiện tại theo brif.md.

Đọc các quyết định đã chốt, hiện trạng code và hướng dẫn repo trước khi sửa.
Giữ mô hình mọi thành viên được tạo project; reviewer là quyền theo project/draft.
Ưu tiên hoàn tất trọn luồng: onboarding → hồ sơ → project → upload → mời → review.
Sửa lỗi lưu tên, project card không tương tác và các điểm khiến người dùng bị mắc kẹt.
Dùng Tide thật cho xác thực và chính sách mã hóa theo cách đã được kiểm chứng.
Không cấp realm admin cho mọi thành viên; tuân theo phương án ký policy đã chốt.
Không lưu mật khẩu Tide, không gửi plaintext tác phẩm/nhận xét tới server.
Bản nhiều máy phải có URL/HTTPS và cấu hình xác thực đồng nhất.

Với từng luồng, xử lý loading, lỗi, quyền, dữ liệu trống và cách tiếp tục sau khi lỗi.
Chạy test phù hợp, kiểm tra giao diện trong browser và ghi riêng kết quả live Tide.
Cập nhật tài liệu và đẩy code đã kiểm tra lên repo public; không commit dữ liệu runtime.
Không tự đánh dấu tính năng hoàn tất khi mới có UI, mock hoặc test demo.
Chỉ hỏi các quyết định sản phẩm còn thiếu; tự xử lý lựa chọn kỹ thuật thông thường.
```

## 11. Quyết định được xác nhận trong chat

Người dùng đã đồng ý cả ba đề xuất và yêu cầu cập nhật brief, triển khai và đẩy repo:

1. Admin nhóm duyệt policy ngay trong app; thành viên thường không cần quyền admin hoặc console.
2. Link mời dùng một lần, giới hạn các draft được chọn; draft mới không tự chia sẻ.
3. HTTPS tunnel tới máy hiện tại để dùng trên cả máy chủ demo và máy khác.

Việc tạo tunnel và cấu hình bản dùng chung đã được cho phép. Các giới hạn network Tide, HTTPS origin và phê duyệt bằng tài khoản thật phải được kiểm tra và báo đúng kết quả.

## 12. Cập nhật sau triển khai và quyết định hoãn tunnel

Người dùng đã chọn giữ bản local hoạt động trước; hoàn tất tunnel sau khi đổi mạng. Cloudflare đã báo kết nối nhưng hostname trả NXDOMAIN trên DNS công khai và kết nối edge sau đó timeout; SSH tunnel thay thế cũng timeout. Cấu hình local đã được khôi phục, không thay DNS/hosts của máy.

Code đã bổ sung project room, profile ứng dụng, quyền theo owner, link mời một lần, owner xác nhận người nhận, queue ký policy và giao diện Approvals. Bộ test API/DPoP/proxy có 16 bài; browser demo có 3 bài. Test dùng fixture policy không thay thế bằng chứng VVK/network thật.

Phần cùng máy dùng các profile browser riêng. Luồng ký policy và mã hóa giữa tài khoản Tide thật cần người quản trị tương tác với enclave để nghiệm thu. Code nhiều máy và script kiểm tra DNS/HTTP trước đổi cấu hình đã chuẩn bị; chưa đánh dấu HTTPS đa máy hoàn tất.

Giới hạn công khai đã thu hẹp: tunnel không chuyển tiếp bất kỳ `/admin/` hoặc master-realm endpoint nào. Admin duyệt từ workspace localhost trên máy chủ demo; thao tác với broker admin đi trực tiếp qua loopback bằng token/DPoP của chính admin.

Người dùng chọn tự kiểm thử Tide thật sau. Không chờ thao tác enclave để đẩy các thay đổi local đã kiểm thử; không đánh dấu checklist network là hoàn tất. Xem `docs/SHARING.md` cho thao tác local và kế hoạch khôi phục tunnel.

Kiểm tra cuối phát hiện realm tắt self-registration. Đã thêm nút Create account qua SDK, bật default required action liên kết Tide và tạo đúng request `setRegistrationAllowed=true`. Request này cần admin nhóm ký tại Approvals/Tide governance; tài khoản mới chưa tự đăng ký được trước khi duyệt. Không tự ký thay người dùng.
