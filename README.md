# Hide YouTube Shorts & Speed Controller (Chrome Extension)

Chrome Extension giúp bạn ẩn hoàn toàn sự xuất hiện của YouTube Shorts trên giao diện YouTube, tự động chặn/chuyển hướng các đường dẫn Shorts thành trình phát thường, đồng thời tích hợp phím tắt thay đổi tốc độ video cực kỳ tiện lợi và mượt mà.

---

## 🌟 Các tính năng chính (Features)

### 1. 🚫 Dọn dẹp & Ẩn YouTube Shorts hoàn toàn
* **Trang chủ (Homepage):** Ẩn hoàn toàn kệ Shorts (Shorts shelf).
* **Kết quả tìm kiếm (Search Results):** Ẩn toàn bộ thanh Shorts và các video ngắn lọt trong danh sách tìm kiếm, không để lại khoảng trống hay thông tin rác (views, nút ba chấm, show more).
* **Thanh bên (Sidebar):** Loại bỏ nút "Shorts" trên cả thanh bên chính (Sidebar) lẫn thanh bên dạng thu nhỏ (Mini-sidebar).
* **Trang lịch sử & Kênh (History & Channel Pages):** Ẩn nút lọc "Shorts" ở đầu trang Lịch sử xem (Watch History) và tab "Shorts" trên các trang kênh của creator.

### 2. 🔄 Chuyển hướng URL thông minh (Redirect URL)
* Tự động phát hiện khi bạn truy cập trực tiếp vào liên kết Shorts (`youtube.com/shorts/...`).
* Cấu hình trực tiếp từ Popup Extension:
  * **Block (Mặc định):** Chuyển hướng bạn quay trở lại trang chủ YouTube.
  * **Watch:** Tự động chuyển đổi giao diện xem Shorts thành giao diện trình phát thông thường (`youtube.com/watch?v=...`) để xem thoải mái hơn.

### 3. ⚡ Phím tắt chỉnh tốc độ phát (Video Speed Controller)
* Nhấn phím **`-` (Trừ)** để giảm tốc độ phát đi `0.1x` (Tối thiểu `0.1x`).
* Nhấn phím **`=` (Bằng)** để tăng tốc độ phát thêm `0.1x` (Tối đa `16.0x`).
* **Lưu tốc độ phát (Speed Persistence):** Extension tự động ghi nhớ tốc độ bạn đang nghe để áp dụng tiếp cho video tiếp theo hoặc khi tải lại trang mà không cần chỉnh lại từ đầu.
* **Đồng bộ thông minh:** Nếu bạn đổi tốc độ qua menu bánh răng mặc định của YouTube, Extension cũng tự động lưu lại tốc độ đó.
* **Không xung đột gõ phím:** Tự động vô hiệu hóa phím tắt khi bạn đang gõ chữ vào ô tìm kiếm, viết bình luận hoặc đăng bài viết.
* **Hiển thị trực quan (Toast):** Xuất hiện thông báo dạng viên thuốc (Glassmorphic Toast) siêu đẹp hiển thị tốc độ phát hiện tại ngay trên khung video và tự động ẩn đi sau 1 giây.

---

## ⌨️ Bảng phím tắt (Keyboard Shortcuts)

| Phím tắt | Chức năng | Ghi chú |
| :--- | :--- | :--- |
| **`-`** | Giảm tốc độ video đi `0.1x` | Không đè Shift |
| **`=`** | Tăng tốc độ video thêm `0.1x` | Không đè Shift |
| **`Shift` + `-`** | Giảm cỡ chữ phụ đề (CC) | Phím tắt gốc của YouTube |
| **`Shift` + `=`** | Tăng cỡ chữ phụ đề (CC) | Phím tắt gốc của YouTube |

---

## 🛠️ Hướng dẫn cài đặt thủ công (Installation)

Do đây là extension tùy chỉnh (chưa được đưa lên Chrome Web Store), bạn có thể cài đặt thủ công bằng các bước sau:

1. **Tải mã nguồn về máy tính:**
   * Clone repository này về máy bằng Git:
     ```bash
     git clone https://github.com/thanhdiner/extension-remove-short-video-yt.git
     ```
   * Hoặc tải file `.zip` từ GitHub về và giải nén ra một thư mục.

2. **Cài đặt vào trình duyệt Chrome:**
   * Mở Google Chrome và truy cập vào đường dẫn: `chrome://extensions/`
   * Bật tùy chọn **Chế độ dành cho nhà phát triển (Developer mode)** ở góc phía trên bên phải.
   * Bấm vào nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.
   * Chọn thư mục chứa mã nguồn extension mà bạn vừa giải nén (thư mục chứa file `manifest.json`).

3. **Sử dụng:**
   * Extension sẽ xuất hiện trên thanh công cụ tiện ích của bạn.
   * Click vào biểu tượng của Extension để tùy chỉnh Trạng thái bật/tắt hoặc chọn Chế độ chuyển hướng (Block/Watch).
