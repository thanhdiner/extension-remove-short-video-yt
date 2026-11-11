# Page Ruler trong DinKit

## Kết quả nghiên cứu (11/11/2026)

- [Chrome Web Store](https://chromewebstore.google.com/detail/page-ruler/jcbmcnpepaddcedmjdcmhbekjhbfnlff): thước hình chữ nhật, hiển thị chiều rộng/cao và hai đầu đo; hỗ trợ chuột và cảm ứng.
- [FAQ tác giả](https://mybrowseraddon.com/page-ruler.html): lưới 50 × 50 pixel, bật/tắt từ toolbar, chỉnh điểm cuối bằng phím mũi tên.
- [Mã bật/tắt](https://github.com/leocompson/page-ruler/blob/main/lib/common.js): giữ trạng thái theo tab, dùng scripting để chèn JS/CSS rồi gửi trạng thái ON/OFF; reset khi tab cập nhật.
- [Mã tương tác](https://github.com/leocompson/page-ruler/blob/main/data/content_script/inject.js): tạo các phần tử DOM phủ trang; theo dõi điểm đầu/cuối, cuộn trang và phím mũi tên/Esc.
- [Mã hiển thị](https://github.com/leocompson/page-ruler/blob/main/data/content_script/resources/render.js): tính và đặt nhãn kích thước/tọa độ quanh vùng đo.

Đây là nghiên cứu từ mô tả và kho mã công khai của tác giả; không khẳng định đã kiểm tra nội dung gói đang phát hành trên Store. Bản DinKit được viết riêng theo hành vi trên, không sao chép mã của tiện ích.

## Cách dùng

Điều chỉnh theo yêu cầu sau ảnh 511 × 330: ưu tiên đặt cả sáu nhãn ngoài vùng đo, W ở trên cạnh ngang, H ở bên trái cạnh dọc. Nếu cạnh đó không đủ chỗ, chọn chỗ trống ngoài khung khác trước. Chỉ cho phép bố trí trong vùng đo khi viewport không còn đủ chỗ cho cả sáu nhãn bên ngoài. Kiểm tra hồi quy hiện có điều kiện nhãn không được che vùng đo khi còn đủ khoảng trống; các so sánh với bản gốc chỉ giữ giá trị và kích thước nhãn, không còn dùng tọa độ W/H nằm trong khung làm chuẩn.

Mở một website → DinKit → **Thước đo trang / Page Ruler**. Kéo để chọn vùng. Kéo lần nữa để đo vùng khác.

- Sáu nhãn trắng quanh khung: (w)/(h) là chiều rộng/cao; hai cặp (x)/(y) là góc trái trên và phải dưới, tính từ đầu tài liệu. Vùng đo vàng nhạt, lưới xám theo bố cục mặc định Grayscale của Page Ruler. Vị trí nhãn theo vùng trống trái/phải/trên/dưới của khung và khả năng chứa nhãn trong vùng đo; khi thiếu chỗ, nhãn đổi hàng/cột theo cùng quy tắc bố cục gốc. Không dùng thuật toán tìm bố cục theo điểm số vì cách này tạo vị trí khác bản gốc.
- Phím mũi tên: chỉnh điểm cuối 1 CSS px; giữ Shift: 10 CSS px.
- Nhấn ô vàng “Đang đo… / Ruler mode…” ở góc trái để mở các nút. Lưới: bật/tắt lưới 50 CSS px. Đo lại: xóa vùng đang đo.
- Đóng, Esc hoặc chọn lại công cụ trong popup: tắt và gỡ lớp đo.
- Tải lại hoặc điều hướng sang tài liệu khác: thước tự biến mất.

## Tích hợp

`src/page-ruler.mjs` chứa hàm khép kín, được `chrome.scripting.executeScript` chạy trong isolated world của tab hiện tại. `src/popup.jsx` cung cấp nút truy cập và các nhãn theo ngôn ngữ DinKit. Dùng lại quyền `scripting`, `tabs`, `activeTab` hiện có; không thêm quyền hay content script chạy thường trực.

Lớp phủ dùng Shadow DOM để tách CSS và popover top layer để hiển thị trên nội dung trang. Pointer Events hỗ trợ chuột/cảm ứng; pointer capture giữ thao tác kéo. Tọa độ tài liệu bằng tọa độ viewport cộng độ cuộn; chiều rộng/cao là trị tuyệt đối của hiệu hai đầu đo, hỗ trợ kéo ngược. Cuộn trang cập nhật vị trí hiển thị. Khi tắt, lớp phủ và các listener toàn cục được gỡ, trả focus về phần tử trước đó.

Khi kéo, gom các sự kiện chuột vào `requestAnimationFrame` và chỉ vẽ vị trí mới nhất mỗi khung hình. Giữ tọa độ lẻ cho chuyển động, chỉ làm tròn nhãn số đo. Khung và nhãn dùng `translate3d`; lớp đo dùng CSS containment. Ô trạng thái giữ chiều rộng ổn định; chữ trên nhãn và nền lưới chỉ cập nhật khi giá trị đổi. Khi thả chuột, cập nhật ngay điểm cuối; khi đóng/reset, hủy khung hình đang chờ.

Đo theo CSS pixel, không nhân devicePixelRatio. Không đo tự động theo phần tử, không lấy ảnh màn hình, không gửi dữ liệu đo ra mạng. Chỉ hỗ trợ trang HTTP/HTTPS có thể chèn mã; Chrome Web Store và trang nội bộ Chrome có thể bị trình duyệt chặn. Đo trên tài liệu chính, chưa đi vào DOM iframe hoặc chế độ fullscreen.

## Xác minh

- `node --test tests/page-ruler.test.mjs`: chọn tab, đối số injection và lỗi trang bị hạn chế.
- `py -3.12 scripts/test-ruler-browser.py`: injection thật trong extension, kéo hai chiều, số đo, phím, cuộn, lưới, reset, toggle, Esc/Đóng và trả lại tương tác trang.
- `tests/fixtures/page-ruler-reference.json`: tọa độ thực của sáu nhãn trong 29 trường hợp do renderer gốc tạo ra (khung lớn/nhỏ/mỏng, kéo ngược, sát các mép, viewport hẹp). Browser test so vị trí và kích thước nhãn DinKit với dữ liệu này, sai số dưới 0,1 CSS px. Có thể thu lại bằng `py -3.12 scripts/record-ruler-reference.py`; script tải mã tham khảo vào thư mục tạm, không đưa mã tác giả vào sản phẩm.

Một số bố cục gốc vẫn có nhãn chồng nhau, ví dụ 117 × 72 px. DinKit giữ nguyên các vị trí hợp lệ và sửa riêng nhãn va chạm/tràn viewport bằng ô trống gần nhất, ưu tiên nhãn tọa độ rồi W rồi H. Test so khớp chính xác với bố cục tham khảo hợp lệ; các trường hợp gốc bị lỗi phải giữ đúng giá trị/kích thước nhãn và hết chồng/tràn. Thêm 24 ca vùng đo ngắn, gồm đúng tọa độ trong ảnh lỗi 472,60 → 589,132.

Kiểm tra stress: `py -3.12 scripts/test-ruler-stress-browser.py`, đã thêm vào `npm run test:browser`. Quét 205.040 tổ hợp kích thước/vị trí, gồm các ngưỡng chuyển bố cục, số đo bằng 0, tọa độ lẻ, nhiều độ rộng viewport và cuộn ngang/dọc. Các mẫu tĩnh dùng Pointer Events giả lập trên con trỏ đang hoạt động; 420 khung chuyển động dùng đầu vào chuột thật của Chromium. Kiểm tra thêm touch thật, zoom 67–200%, resize và đóng thước. Mọi nhãn phải đúng số, không chồng nhau, không tràn viewport, không bị cắt chữ hoặc bị ô trạng thái che.

Các lỗi bổ sung đã sửa: dành chỗ cho ô trạng thái; xếp lại nhãn khi vùng nhìn hẹp khiến cách sửa từng nhãn không còn đủ chỗ; đo chữ để mở rộng nhãn cho tọa độ dài. Nếu tọa độ dài đồng thời viewport quá hẹp, giảm cỡ chữ vừa đủ để hiển thị đủ sáu nhãn, không cắt số. Giữ cỡ mặc định khi đủ chỗ.
- `npm run build` và `npm run check`.
