# Cộng tác trong nhóm

Repo dành cho CreatorRoom, Challenge 2 của nhóm Old Ferrari. Không đưa dữ liệu, notebook, checkpoint hoặc credentials của Challenge 1 vào đây.

## Thêm thành viên

Chủ repo mở **Settings → Collaborators → Add people**, tìm GitHub username hoặc email của thành viên và gửi lời mời. Thành viên cần chấp nhận lời mời để push code. Repo public cho phép mọi người đọc; quyền ghi vẫn cần được cấp riêng.

## Quy trình làm việc

1. Nhận một đầu việc trong `docs/TEAM.md` và trao đổi với nhóm để tránh sửa cùng phần.
2. Cập nhật nhánh chính rồi tạo nhánh riêng:

```bash
git switch main
git pull --ff-only
git switch -c codex/your-task
```

3. Commit các file liên quan đến đầu việc; kiểm tra `git diff --cached` trước khi push.
4. Push nhánh và mở pull request vào `main`. Ghi chức năng đã làm, cách thử và giới hạn còn lại.
5. Đề nghị một bạn kiểm tra trước khi merge; cập nhật hướng dẫn chạy khi thay đổi cấu hình.

Không commit `.env`, token, mật khẩu, khóa giải mã, bản export chứa secret hoặc tác phẩm thật chưa được phép công bố. Dùng `.env.example` với placeholder khi cấu hình ứng dụng đã được xác định.

## Điều phải giữ đúng khi demo

- Dùng TideCloak thật cho các bảo vệ được tuyên bố; ghi rõ phần nào là mock.
- Không xem việc ẩn nút là bằng chứng kiểm soát truy cập.
- Không nói operator không đọc được nếu backend/storage vẫn có plaintext.
- Không nói rút quyền xóa được bản sao mà reviewer đã đọc hoặc tải về.
