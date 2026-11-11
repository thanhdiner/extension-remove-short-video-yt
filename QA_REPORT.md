# Kiểm tra DinKit — 07/11/2026

Phạm vi: toàn bộ module đang được nạp từ `manifest.json`, worker nền, popup, Options, editor, native host và khả năng giữ dữ liệu sau reload extension. Kiểm tra dùng profile Chromium riêng, tài khoản 2FA mẫu công khai, file/repository/remote/proxy cục bộ. Không sửa dữ liệu trong profile Chrome cá nhân.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run build` | Đạt |
| `npm test` | 76/76 đạt |
| `npm run test:native` | 18/18 đạt |
| `npm run check` | 78 tài nguyên tham chiếu hợp lệ, ID HTML không trùng, không có script inline vi phạm CSP, 119 file JavaScript hợp lệ cú pháp |
| `npm run test:browser` | 9/9 bộ đạt trong cùng lượt tổng hợp, 136,2 giây |
| `npm audit` | 0 lỗ hổng được báo trong cây dependency hiện tại |
| `npm audit --prefix editor/terminal-host` | 0 lỗ hổng được báo trong native host |
| `git diff --check` | Đạt |

## Các lỗi đã sửa trong đợt kiểm tra

- **Focus:** xử lý alarm kết thúc phiên riêng; đặt alarm theo `endsAt`; khôi phục alarm của phiên đang chạy sau reload/cài đặt lại extension hoặc khởi động trình duyệt. Tránh thông báo kết thúc lặp khi các sự kiện đến đồng thời.
- **Quy tắc chặn:** tuần tự hóa cập nhật DNR; khớp URL có port/query và tiền tố đường dẫn đúng với bộ khớp nội bộ; sửa ngoại lệ Reddit có query và ranh giới tên miền cho emergency unlock.
- **Thống kê thời gian:** ghi nhận khoảng sử dụng trước khi cửa sổ mất focus hoặc máy chuyển sang idle, không cộng thời gian inactive vào lần quay lại.
- **Healthy Feed:** chấp nhận yêu cầu hợp lệ từ Options mở trong tab, tiếp tục từ chối trang gửi không được hỗ trợ.
- **YouTube:** khi tắt tính năng, ngừng bắt phím tua/tốc độ; giữ phím có Ctrl/Alt/Meta cho trình duyệt. Bổ sung nạp NonStop trên YouTube Music và giữ trang Home của Music.
- **NotebookLM:** tắt tiện ích trả lại nội dung đã ẩn và giữ style gốc của website; không ẩn cả body khi iframe nằm trực tiếp dưới body.
- **Sao lưu Focus:** từ chối cấu trúc JSON sai trước khi ghi dữ liệu. Giữ nguyên URL có nhiều tham số trong nhật ký chặn.
- **Editor:** đóng rồi mở lại hộp đường dẫn thư mục ngắt picker cũ; kết quả muộn không điền vào hộp mới và sự kiện đóng cũ không ngắt picker mới.
- **Bài kiểm tra:** cập nhật kỳ vọng số tài khoản nhóm; chờ sự kiện đóng dialog và trạng thái render thực tế thay vì chờ thời gian cố định quá ngắn.

## Độ phủ kiểm tra trình duyệt

| Bộ kiểm tra | Nội dung |
| --- | --- |
| `test-auth-browser.py` | TOTP, thêm/sửa/xóa, tìm/lọc, nhóm, clipboard, IndexedDB, JSON mã hóa, sai mật khẩu, QR Google nhiều phần và khôi phục |
| `test-auth-drag-browser.py` | Kéo nhóm, kéo tài khoản giữa nhóm, grid, lưu thứ tự sau reload |
| `test-json-browser.py` | Injection thật, JSON trên máy, fold/raw/copy, ngôn ngữ, bật/tắt, số lớn, dữ liệu sai/lớn/sâu, MIME, iframe, CSP, không gọi lại API |
| `test-proxy-browser.py` | Lưu lượng HTTP/HTTPS/SOCKS5/IPv6, CONNECT, xác thực, DIRECT, wildcard/prefix, nhập Bypass Flow, thứ tự tuyến, probe, lỗi proxy và lưu cấu hình |
| `test-editor-browser.py` | Monaco/worker TypeScript, TXT, Explorer, nhiều khung/workspace, bản nháp và xung đột nhiều tab, đồng bộ file, native save/auto save, reload, PowerShell, Git diff/stage/commit/branch/Fetch/Pull/Push, bảo vệ bản nháp |
| `test-focus-browser.py` | UI phiên tập trung, DNR chặn thật, emergency unlock/hết hạn, quota ngày, Reddit whitelist, alarm thật, log phiên, import/export, lọc feed và Strict Mode |
| `test-utilities-browser.py` | Shorts, phím tốc độ/tua, tốc độ đã lưu, loại trừ ô nhập, bật/tắt, chuyển hướng Watch/Home, NonStop/Music, Alt+scroll, Learning Mode, NotebookLM và clipboard |
| `test-ui-browser.py` | Menu Việt/Anh, list/grid/import, vùng cuộn, tooltip click, accordion, tất cả tab Options ở desktop và chiều rộng 390 px; lưu ảnh để rà trực quan |
| `test-lifecycle-browser.py` | Dùng nút Reload thật tại `chrome://extensions`; kiểm tra 2FA, proxy, cài đặt, ngôn ngữ, bản nháp, alarm Focus và trang video còn mở sau reload |

Kiểm tra logic bổ sung bao gồm quota/cooldown/phiên thử Healthy Feed dùng chung giữa nhiều tab, nguồn/chủ đề tiếng Việt, giới hạn Strict Mode, reset ngày và thay đổi trì hoãn, số liệu sử dụng khi các sự kiện đến đồng thời.

## Giới hạn của kết quả

- YouTube, Facebook và NotebookLM được kiểm tra bằng trang fixture có URL đúng và content script thật; không thao tác tài khoản đăng nhập cá nhân. Kết quả không đảm bảo mọi biến thể DOM/A-B test của các website ngoài sẽ luôn tương thích.
- Proxy dùng máy chủ thử thật trên máy; Git dùng remote bare cục bộ. Không kiểm tra nhà cung cấp proxy ngoài hoặc xác thực GitHub/GitLab bằng tài khoản cá nhân.
- Bridge sang DinSide chưa được kiểm tra với một phiên DinSide đang hoạt động. Không gửi nội dung editor hay prompt tới dịch vụ ngoài trong lượt QA.
- Đây là kiểm tra chức năng/hồi quy và kiểm tra dependency, không phải kiểm toán bảo mật độc lập hay thử tải dài ngày.

Log của lượt tổng hợp nằm tại `%TEMP%\dinkit-qa-run\`. Ảnh UI dùng dữ liệu mẫu nằm tại `%TEMP%\dinkit-qa-ui\`.
