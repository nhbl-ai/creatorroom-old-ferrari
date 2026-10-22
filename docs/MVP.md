# CreatorRoom MVP

## Ý tưởng đã chốt

Không gian cộng tác trên tác phẩm chưa công bố: creator mời reviewer vào đúng nội dung cần góp ý, trong khi nền tảng không cần quyền đọc toàn bộ tác phẩm.

## Phạm vi đầu tiên

- Dùng một hoặc hai ảnh thiết kế nhỏ do nhóm tự tạo; có thể bắt đầu bằng một đoạn văn bản giả để thử mã hóa.
- Hai project A/B, mỗi project có một asset.
- Creator, reviewer được mời và tài khoản operator tách biệt.
- Reviewer được mở asset A và thêm nhận xét đơn giản, nhưng không mở được asset B.
- Operator kiểm tra kho lưu và chỉ thấy ciphertext của nội dung được bảo vệ.
- Rút quyền truy cập tương lai là phần mở rộng sau khi xác minh cơ chế hỗ trợ; không che giới hạn bằng cách buộc reviewer đăng nhập lại.
- Không làm video streaming, watermark/DRM, thanh toán hoặc train model trong MVP đầu tiên.

## Tích hợp Tide cần xác minh trên realm thật

1. Template và Tide enrollment hoạt động.
2. Một payload được mã hóa và mở bởi phiên người dùng hợp lệ.
3. SDK hỗ trợ cách chia sẻ payload cho reviewer được chỉ định như thế nào.
4. Quyền được ràng buộc theo asset/project ở đâu; một role `reviewer` chung là chưa đủ.
5. Backend và operator có thể thấy plaintext ở bước nào không.
6. Ai có thể sửa quyền; những thay đổi nào cần quorum thực tế.
7. Nếu triển khai rút quyền: phiên cũ, token cũ và dữ liệu đã cache bị ảnh hưởng thế nào.

Không tự đặt tên API hoặc triển khai mật mã riêng để thay thế một tính năng Tide chưa xác minh. Tham khảo [Quickstart](https://docs.tide.org/get-started/Tidecloak%20Quickstart) và [Core concepts](https://docs.tide.org/Core-Concepts/core-concepts).

## Phân chia trách nhiệm

- Ứng dụng: project, metadata của asset, lời mời, nhận xét, giao diện.
- TideCloak và đường mã hóa được hỗ trợ: xác thực và bảo vệ truy cập/giải mã theo cấu hình được kiểm chứng.
- Storage: ciphertext cho nội dung mà nhóm tuyên bố operator không đọc được.

Chỉ có consent hoặc ACL trong DB ứng dụng chưa chứng minh operator không thể vượt quyền. Quorum quản trị không tự động trở thành quy trình phê duyệt mọi lượt đọc.

## Kiểm tra chấp nhận

- [ ] Chưa đăng nhập: yêu cầu mở nội dung bị từ chối.
- [ ] Reviewer được mời mở asset A thành công.
- [ ] Reviewer thay ID trong yêu cầu sang asset B và bị từ chối.
- [ ] Tài khoản không được mời mở asset A bị từ chối.
- [ ] Storage không chứa plaintext hoặc master key của nội dung được bảo vệ.
- [ ] Operator không có khả năng mở nội dung qua luồng giải mã đã bảo vệ.
- [ ] Không ghi token, khóa hoặc nội dung giải mã vào log.
- [ ] Nhận xét không tự làm lộ nội dung asset cho người ngoài phạm vi.
- [ ] Nếu có rút quyền, thử ngay trong phiên reviewer cũ và ghi kết quả/độ trễ.

## Demo hai phút dự kiến

- 0–20 giây: creator cần nhận góp ý cho tác phẩm chưa công bố.
- 20–45 giây: creator chọn asset A và mời reviewer.
- 45–75 giây: reviewer mở A và để lại nhận xét.
- 75–95 giây: reviewer thử mở B và bị từ chối.
- 95–110 giây: operator kiểm tra storage; chỉ thấy ciphertext.
- 110–120 giây: giải thích giá trị và giới hạn đã kiểm chứng.

## Trạng thái triển khai

Đã có application code React/Vite + Express, local demo chạy xuyên suốt, kiểm thử API/JWT và trình duyệt. Code Tide dùng SDK thật và policy `RelationshipAttestation:1` theo người nhận/asset; **chưa chạy với realm thật**. Xem `TIDECLOAK.md` để setup và `VALIDATION.md` để phân biệt bằng chứng đã có với việc còn lại.

Trong MVP tích hợp, creator phải kiêm Tide admin để phê duyệt policy trong browser. Reviewer được cấp quyền crypto đọc và ghi của đúng record vì nhận xét cũng được mã hóa; API chỉ cho creator ghi bản gốc. Thời hạn lời mời là 1 hoặc 24 giờ. Xóa lời mời chặn các lượt API sau đó; không thu hồi chắc chắn policy đã sao chép trước expiry.

Các checkbox ở trên là mục tiêu nghiệm thu Tide thật, không tự đánh dấu hoàn thành từ local demo.
