# Hide YouTube Shorts & Speed Controller (Chrome Extension)

Bản tích hợp DinKit: xem [báo cáo kiểm tra toàn bộ](QA_REPORT.md). Chạy lại kiểm tra trên Windows bằng:

```powershell
npm run build
npm test
npm run test:native
npm run check
npm run test:browser
```

Kiểm tra trình duyệt cần Python 3.12, Playwright/Chromium và native host editor đã đăng ký cho ID DinKit. Các bài kiểm tra dùng hồ sơ và dữ liệu tạm riêng.

Chrome Extension giúp bạn ẩn hoàn toàn sự xuất hiện của YouTube Shorts trên giao diện YouTube, tự động chặn/chuyển hướng các đường dẫn Shorts thành trình phát thường, đồng thời tích hợp phím tắt thay đổi tốc độ video cực kỳ tiện lợi và mượt mà.

---

## Các tính năng chính (Features)

### 1. Dọn dẹp & Ẩn YouTube Shorts hoàn toàn
* **Trang chủ (Homepage):** Ẩn hoàn toàn kệ Shorts (Shorts shelf).
* **Kết quả tìm kiếm (Search Results):** Ẩn toàn bộ thanh Shorts và các video ngắn lọt trong danh sách tìm kiếm, không để lại khoảng trống hay thông tin rác (views, nút ba chấm, show more).
* **Thanh bên (Sidebar):** Loại bỏ nút "Shorts" trên cả thanh bên chính (Sidebar) lẫn thanh bên dạng thu nhỏ (Mini-sidebar).
* **Trang lịch sử & Kênh (History & Channel Pages):** Ẩn nút lọc "Shorts" ở đầu trang Lịch sử xem (Watch History) và tab "Shorts" trên các trang kênh của creator.

### 2. Chuyển hướng URL thông minh (Redirect URL)
* Tự động phát hiện khi bạn truy cập trực tiếp vào liên kết Shorts (`youtube.com/shorts/...`).
* Cấu hình trực tiếp từ Popup Extension:
  * **Block (Mặc định):** Chuyển hướng bạn quay trở lại trang chủ YouTube.
  * **Watch:** Tự động chuyển đổi giao diện xem Shorts thành giao diện trình phát thông thường (`youtube.com/watch?v=...`) để xem thoải mái hơn.

### 3. Phím tắt chỉnh tốc độ phát (Video Speed Controller)
* Nhấn phím **`-` (Trừ)** để giảm tốc độ phát đi `0.1x` (Tối thiểu `0.1x`).
* Nhấn phím **`=` (Bằng)** để tăng tốc độ phát thêm `0.1x` (Tối đa `16.0x`).
* **Lưu tốc độ phát (Speed Persistence):** Extension tự động ghi nhớ tốc độ bạn đang nghe để áp dụng tiếp cho video tiếp theo hoặc khi tải lại trang mà không cần chỉnh lại từ đầu.
* **Đồng bộ thông minh:** Nếu bạn đổi tốc độ qua menu bánh răng mặc định của YouTube, Extension cũng tự động lưu lại tốc độ đó.
* **Không xung đột gõ phím:** Tự động vô hiệu hóa phím tắt khi bạn đang gõ chữ vào ô tìm kiếm, viết bình luận hoặc đăng bài viết.
* **Hiển thị trực quan (Toast):** Xuất hiện thông báo dạng viên thuốc (Glassmorphic Toast) siêu đẹp hiển thị tốc độ phát hiện tại ngay trên khung video và tự động ẩn đi sau 1 giây.

### 4. Tự động phát không dừng (YouTube NonStop)
* Tự động phát hiện và bỏ qua hộp thoại xác nhận tạm dừng **"Video paused. Continue watching?" (Video đã tạm dừng. Tiếp tục xem?)** của YouTube và YouTube Music khi treo máy nghe nhạc hoặc playlist lâu.
* Tự động click vào nút tiếp tục và cho video phát tiếp ngay lập tức mà không cần tương tác thủ công.

---

## Bảng phím tắt (Keyboard Shortcuts)

| Phím tắt | Chức năng | Ghi chú |
| :--- | :--- | :--- |
| **`-`** | Giảm tốc độ video đi `0.1x` | Không đè Shift |
| **`=`** | Tăng tốc độ video thêm `0.1x` | Không đè Shift |
| **`Shift` + `-`** | Giảm cỡ chữ phụ đề (CC) | Phím tắt gốc của YouTube |
| **`Shift` + `=`** | Tăng cỡ chữ phụ đề (CC) | Phím tắt gốc của YouTube |

---

## Hướng dẫn cài đặt thủ công (Installation)

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


## Focus Firewall tích hợp

Mở popup của extension và chọn **Focus Firewall** để bắt đầu phiên tập trung, quản lý Healthy Feed hoặc mở trang Rules. Focus Firewall dùng bộ nhớ riêng của extension này: để chuyển cấu hình từ extension Focus Firewall cũ, xuất bằng **Open Rules → Export Settings**, rồi nhập tệp bằng **Open Rules → Import Settings** trong bản tích hợp. Kiểm tra lại các quy tắc trước khi tắt extension cũ. Dữ liệu phiên và lịch sử không được chuyển bằng tính năng xuất cấu hình.

## Giao diện DinKit

Popup chính dùng React và Material UI. Sau khi sửa `src/popup.jsx`, chạy `npm install` và `npm run build` để cập nhật `dist/popup.js`, sau đó tải lại extension trong Chrome. Các trang Focus Firewall hiện vẫn dùng giao diện riêng của chúng.

Popup DinKit nhóm công cụ theo danh sách; chọn YouTube hoặc Tiện ích trình duyệt để mở cài đặt. Các thay đổi được lưu tự động.

## Trình soạn thảo

Local Text Editor đã được tích hợp trong thư mục `editor/`. Reload DinKit tại `chrome://extensions`, rồi chọn **DinKit → Trình soạn thảo / Text Editor** để mở trong tab riêng. Giữ Monaco, Explorer, nhiều khung soạn thảo, workspace, Git và terminal của bản gốc. Ngôn ngữ dùng chung mục **Ngôn ngữ** của DinKit; đổi trong cài đặt editor cũng cập nhật toàn extension.

Khi bật **Allow access to file URLs** cho DinKit, file `.txt` mở bằng Chrome tự chuyển vào editor; JSON Formatter tiếp tục xử lý tài liệu JSON riêng. Workspace và bản nháp nằm trong bộ nhớ của DinKit, không tự lấy workspace đã lưu của extension Local Text Editor cũ.

Terminal, Git và lưu TXT trực tiếp dùng native host riêng `dinkit.editor`. Host đã được đăng ký cho ID DinKit trên máy hiện tại. Nếu chuyển máy hoặc đổi ID extension, chạy từ thư mục DinKit:

```powershell
npm ci --prefix editor/terminal-host
powershell -ExecutionPolicy Bypass -File .\editor\terminal-host\install.ps1 -ExtensionId <ID-DinKit>
```

Sau đó reload DinKit. Host riêng giữ nguyên đăng ký native host của Local Text Editor cũ. Khi chưa có host, vẫn có thể mở/lưu qua hộp thoại Chrome; xem [hướng dẫn editor](editor/README.md) để biết các chức năng còn lại.

Kiểm thử: `npm run build`, `npm test`, `node --test editor/tests/*.test.js`, và `py -3.12 scripts/test-editor-browser.py` (Python Playwright + Chromium). Bài kiểm thử trình duyệt dùng profile, file và Git repository tạm; kiểm tra menu, ngôn ngữ, worker Monaco, TXT, nhóm editor, workspace sau reload, đồng bộ/xung đột file, lưu trực tiếp/tự động, terminal PowerShell và Git qua native host. Bài kiểm thử native cần đăng ký host cho ID extension thử nghiệm trước.

## JSON Formatter

Trong **Tiện ích trình duyệt**, bật/tắt **JSON Formatter**. Khi mở một tài liệu JSON qua HTTP/HTTPS hoặc mở tệp `.json` trên máy, DinKit tự định dạng, tô màu cú pháp, cho phép thu gọn từng nhánh, xem bản gốc và sao chép. Với tệp cục bộ, bật **Cho phép truy cập vào URL của tệp / Allow access to file URLs** tại `chrome://extensions` → DinKit → Chi tiết. Giao diện dùng chung lựa chọn Tiếng Việt/English của extension. Tắt tính năng sẽ khôi phục trang gốc ngay trên các tab đang mở.

Bộ định dạng giữ nguyên số lớn, khóa trùng nhau, thứ tự khóa và chuỗi escape; không gửi nội dung JSON ra ngoài và không tải lại API. Chỉ nhận tài liệu `application/json`, `application/*+json`, `text/json` hoặc `text/plain` chứa JSON hợp lệ; bỏ qua trang HTML, iframe, JSON không hợp lệ và tài liệu trên 5 MiB ký tự. Tài liệu nhiều hơn 20.000 token hoặc sâu hơn 64 cấp dùng dạng văn bản để tránh dựng quá nhiều thành phần giao diện.

Kiểm thử: `npm run build` rồi `npm test`. Kiểm thử extension trong Chromium với profile tạm: cài Python Playwright và Chromium (`pip install playwright`, `playwright install chromium`), sau đó chạy `python scripts/test-json-browser.py`. Kịch bản này kiểm tra cả giao diện MUI, bật/tắt trực tiếp, ngôn ngữ, clipboard, MIME, CSP, JSON lớn/sâu, iframe và số lần gọi API; không dùng profile Chrome cá nhân.

## Proxy theo website

Mở **DinKit → Proxy → Thêm website**, nhập tên miền, loại proxy, máy chủ và cổng; lưu rồi bật **Proxy theo website**. Hỗ trợ HTTP, HTTPS, SOCKS5 và địa chỉ IPv4/IPv6. Có thể bật/tắt từng website, sửa, xóa và áp dụng cho các tên miền con. Proxy mặc định tắt và cần máy chủ proxy do bạn cung cấp.

Nút **Thêm trang hiện tại** lấy tên miền của tab HTTP/HTTPS đang mở và điền sẵn vào biểu mẫu; nếu đã có quy tắc đúng tên miền đó, nút mở quy tắc để chỉnh sửa. Các trang nội bộ Chrome, tệp và trang extension không hiển thị nút này.

Quy tắc áp dụng cho mọi tab và chạy từ trên xuống: quy tắc đầu tiên khớp sẽ được dùng. Chọn **DIRECT** để tạo ngoại lệ không đi qua proxy. Mở sửa quy tắc để dùng nút lên/xuống thay đổi thứ tự. Cấu hình DinKit cũ tự giữ thứ tự ưu tiên tên miền cụ thể khi nâng cấp sang cách quản lý này. Website không khớp kết nối trực tiếp; tài nguyên từ CDN/tên miền khác cần quy tắc riêng. Website đã chọn sẽ báo lỗi khi proxy không hoạt động. Tắt Proxy sẽ trả lại cấu hình proxy trước đó của Chrome. Nếu Bypass Flow hoặc tiện ích khác đang điều khiển proxy, DinKit báo xung đột; tắt tiện ích đó trước khi bật Proxy trong DinKit. Cơ chế định tuyến dùng [Chrome Proxy API](https://developer.chrome.com/docs/extensions/reference/api/proxy).

Tài khoản HTTP/HTTPS nằm trong mục thu gọn **Tài khoản proxy**. Cấu hình và mật khẩu được lưu trong `chrome.storage.local`, không đồng bộ qua tài khoản Chrome. Chrome không hỗ trợ xác thực SOCKS5; SOCKS5 ở đây dùng proxy không yêu cầu tài khoản ([tài liệu Chromium](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md)).

Kiểm thử lưu lượng thực tế trong Chromium riêng: `python scripts/test-proxy-browser.py` (Python Playwright, Chromium và OpenSSL; Git for Windows có OpenSSL). Kịch bản dựng proxy HTTP/HTTPS/SOCKS5/IPv6 cục bộ, kiểm tra xác thực, CONNECT, website đi trực tiếp, proxy lỗi, MUI thêm/sửa/xóa/bật/tắt và ngôn ngữ; không thay đổi profile Chrome cá nhân.

Phần Proxy tham khảo mã nguồn Bypass Flow tại `F:\All Project\proxy-config`. Các tính năng được đưa vào giao diện MUI của DinKit:

- **Danh sách proxy**: lưu máy chủ một lần rồi chọn cho nhiều quy tắc. Sửa một proxy sẽ cập nhật các quy tắc đang chọn proxy đó. Muốn xóa proxy, đổi hoặc xóa các quy tắc đang dùng trước.
- **Nhập danh sách proxy**: hỗ trợ `host:port`, `host:port:user:pass`, `user:pass@host:port`, URI HTTP/HTTPS/SOCKS5, IPv6 có ngoặc vuông, pipe/CSV, mảng JSON proxy và JSON Bypass Flow dạng `{proxies, routes}` (kể cả định dạng cũ `{proxyConfig, rules}`). Nhập được kiểm tra toàn bộ trước khi lưu, giữ thứ tự DIRECT và quy tắc, bỏ qua proxy trùng và không tự bật công tắc Proxy. Không nhập được dữ liệu đang lưu riêng của extension khác chỉ từ thư mục mã nguồn.
- **Kiểm tra tuyến**: nút **Xem tuyến** chạy bộ khớp quy tắc chung với PAC; **Thử kết nối** gửi GET không kèm cookie, hiển thị mã HTTP và thời gian, giới hạn chờ 8 giây. Kiểm tra tuyến không đổi cấu hình đang dùng.

Tên miền trong quy tắc dùng chung proxy bao gồm cả tên miền con; `*.example.com` chỉ khớp tên miền con. Quy tắc có thể dùng tiền tố URL HTTP. Chrome bỏ đường dẫn HTTPS khi gọi PAC, nên DinKit từ chối quy tắc kiểu `https://example.com/path/` thay vì báo khớp sai; hãy dùng `example.com` hoặc `https://example.com/`. Đây là [giới hạn của Chromium](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md#Arguments-passed-to-FindProxyForURL_in-PAC-scripts).

## Authenticator / Xác thực 2FA

Tích hợp từ Quick 2FA tại `F:\All Project\Extension\Authen`, dùng React + MUI và ngôn ngữ chung của DinKit. Mở **DinKit → Xác thực 2FA / Authenticator** để thêm secret Base32 hoặc URI `otpauth://totp/...`, sao chép mã, tìm kiếm, lọc theo nhóm, đổi dạng danh sách/lưới, sửa, xóa hoặc sắp xếp tài khoản bằng kéo thả và menu lên/xuống. Kéo tay nắm ở tiêu đề nhóm để sắp xếp nhóm; kéo tay nắm tài khoản sang nhóm khác sẽ chuyển tài khoản sang nhóm đó. Nhóm có thể tạo, đổi tên, sắp xếp và bỏ mà vẫn giữ tài khoản.

- TOTP hỗ trợ SHA-1/SHA-256/SHA-512, mã 6/8 chữ số và chu kỳ 1–3600 giây. Dùng đồng hồ của máy tính; kiểm thử theo đủ 18 mẫu RFC 6238. Chỉ tính mã khi mục Authenticator đang mở, thư viện QR tải khi cần.
- **Nhập tài khoản** nhận JSON/JSON mã hóa của Quick 2FA, URI otpauth, ảnh QR thường và QR chuyển tài khoản Google Authenticator. Chọn nhiều ảnh để nhập đủ các phần của một đợt chuyển; nhập lặp sẽ bỏ qua bản trùng. Tất cả tệp được kiểm tra trước khi lưu trong một lần ghi.
- **Xuất bản sao lưu** nhận mật khẩu tùy chọn. Có mật khẩu: AES-GCM 256 bit, khóa PBKDF2-SHA256 210.000 vòng; để trống: JSON chứa secret. Định dạng tương thích Quick 2FA cũ, bổ sung tên/thứ tự nhóm. Không có mật khẩu tổng để khóa ứng dụng; chỉ bản sao lưu có mật khẩu được mã hóa.
- **Xuất QR Google Authenticator** tạo PNG và tự chia nhiều phần. Chỉ xuất tài khoản có chu kỳ 30 giây để tránh mất cấu hình; chu kỳ khác dùng JSON. QR chứa secret và không được gửi tới dịch vụ bên ngoài.
- Tài khoản được lưu trong IndexedDB thuộc origin extension, không đặt trong `chrome.storage.local/sync` mà content script của DinKit đọc trên website. Worker chỉ nhận thao tác Authenticator từ trang popup DinKit. Xóa toàn bộ cần xác nhận hai bước và nhập `DELETE ALL`.

Để chuyển dữ liệu từ Authen đang cài: xuất JSON (có thể đặt mật khẩu) hoặc QR từ Quick 2FA cũ, rồi nhập vào DinKit. Thư mục mã nguồn không chứa dữ liệu tài khoản đã lưu của extension đang cài, nên DinKit không tự chuyển dữ liệu chỉ từ đường dẫn thư mục.

Kiểm thử: `npm run build`, `npm test`, `python scripts/test-auth-browser.py` (Python Playwright + Chromium, profile riêng với secret công khai của RFC). Bao gồm thêm/sửa/xóa, clipboard, nhóm, lưu IndexedDB, xuất/nhập mã hóa, mật khẩu sai và vòng xuất/nhập ảnh QR Google Authenticator.
