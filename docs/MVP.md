# CreatorRoom MVP

## Phạm vi đã triển khai

Mỗi thành viên sở hữu project của mình và làm reviewer của draft được mời trong project khác. Chỉ máy host vận hành Docker/TideCloak; người dùng đăng nhập/đăng ký qua browser.

- Hồ sơ chỉ có display name tùy chọn, lưu theo danh tính đã xác minh trong app; không tạo email giả.
- Project card mở room có sửa metadata, upload đầu tiên, danh sách draft, lời mời và điều hướng/refresh URL.
- PNG/JPEG/WebP/TXT tối đa 1 MB; chuẩn bị policy trước, mã hóa trong browser rồi gửi ciphertext. Reservation chờ có Continue upload hoặc Discard.
- Owner chọn 1–10 draft đã upload, tạo link một lần có hạn nhận 24 giờ. Người nhận đăng nhập và claim; owner xác nhận đúng mã tài khoản trước khi xin policy.
- Admin nhóm duyệt policy bằng phiên browser của họ. Thành viên thường không có realm admin. Approver không tự được grant đọc draft của owner.
- Reviewer chỉ đọc/góp ý với grant còn hạn; nhận xét mã hóa. Draft mới không tự chia sẻ. Sai người/draft bị API từ chối.
- Operator riêng kiểm tra ciphertext; không đọc nội dung qua API.
- Hủy link chặn API tiếp theo; không thu lại nội dung đã đọc hoặc vô hiệu chắc chắn policy đã copy còn hạn.

Luồng local tự động đã kiểm thử; mã hóa/chia sẻ giữa hai người Tide thật vẫn chờ nghiệm thu tương tác enclave. HTTPS hai máy hoãn theo yêu cầu sau khi các tunnel không ổn định trên mạng hiện tại.

## Phân chia trách nhiệm

Ứng dụng quản lý metadata, profile, lời mời, queue và kiểm tra owner/grant. Tide adapter thực hiện xác thực, DPoP, ký policy `RelationshipAttestation:1` theo người nhận + asset và SDK encryption/decryption. Backend kiểm tra cấu trúc/scope/expiry; ORKs phải xác minh chữ ký VVK thực tế. Fixture policy trong test không chứng minh chữ ký network hợp lệ.

Group approver khác với operator. Muốn ngăn admin tự đề nghị cấp quyền cần cấu hình/quorum và kiểm thử riêng. Không tuyên bố chỉ có ACL trong DB đã loại bỏ mọi quyền kiểm soát đơn phương.

## Ngoài phạm vi hiện tại

Video lớn/streaming, DRM, thanh toán, chat thời gian thực, nhiều instance JSON storage và bảo đảm xóa bản sao đã đọc. Không triển khai custom Forseti contract hoặc tự thay mật mã khi network không hỗ trợ built-in policy.

## Nghiệm thu còn lại

Theo [TIDECLOAK.md](TIDECLOAK.md), thử A/B bằng browser profile riêng: owner upload sau approve, reviewer nhận lời mời/read/comment, owner đọc feedback, sai người/record/operator bị network từ chối và policy hết hạn thực tế. Ghi bằng chứng vào [VALIDATION.md](VALIDATION.md). Sau khi đổi mạng, làm tiếp [SHARING.md](SHARING.md) và thử đăng nhập hai máy.

## Demo hai phút dự kiến

- 0–20 giây: nhu cầu góp ý tác phẩm chưa công bố và rào cản nền tảng đọc được tác phẩm.
- 20–45 giây: owner mở project, chọn draft và mời reviewer; giải thích admin nhóm ký bằng Tide.
- 45–75 giây: reviewer đọc và góp ý, owner đọc feedback.
- 75–95 giây: thử draft khác và bị từ chối.
- 95–110 giây: operator kiểm tra ciphertext.
- 110–120 giây: giá trị và đúng giới hạn đã kiểm chứng; ghi rõ nếu cảnh quay dùng demo simulation.

Đầu bài và các quyết định sản phẩm được giữ trong [brif.md](../brif.md).
