# Kiểm tra thước đo DinKit — 11/11/2026

Bổ sung sau ảnh 511 × 330: yêu cầu mới là giữ W/H ngoài vùng đo. Đã chuyển vị trí mặc định W lên trên, H sang trái và ưu tiên bố trí cả sáu nhãn ngoài khung trước khi dùng cách bố trí trong viewport chật. Đã kiểm tra hai chiều kéo tại 706,278 → 1217,608, xác nhận không nhãn nào giao vùng đo. [Ảnh sau sửa](qa/page-ruler/511x330-outside.png). Lượt stress cuối vẫn đạt 205.040 tổ hợp và 420 khung chuột thật, có thêm điều kiện nhãn không che vùng chọn khi các cạnh còn đủ chỗ. Test so vị trí tuyệt đối với Grayscale gốc đã được thay bằng yêu cầu bố trí mới; dữ liệu tham khảo gốc chỉ dùng kiểm tra giá trị/kích thước nhãn.

## Phạm vi và kết quả

Kiểm tra bằng Chromium trong profile tạm, không thay đổi dữ liệu Chrome cá nhân. Đã tái hiện ba ảnh báo lỗi: 197 × 143 tại 450,212; 117 × 72 tại 472,60; 190 × 72 tại 476,264. Ảnh dùng nội dung mẫu và nền tối.

| Kiểm tra | Kết quả cuối |
| --- | --- |
| Build | Đạt |
| `npm test` | 80/80 đạt |
| `npm run test:native` | 18/18 đạt |
| `npm run check` | Đạt: 78 tài nguyên, 121 kiểm tra cú pháp JS |
| Browser thước cơ bản | 29 bố cục tham khảo + 24 trường hợp vùng ngắn đạt |
| Stress thước | 205.040 tổ hợp, không có lỗi được phát hiện trong các tổ hợp đó |
| Chuyển động | 420 khung đầu vào chuột thật đạt |
| Zoom | 67%, 80%, 100%, 125%, 150%, 200% đạt |
| Touch, resize, Esc/Đóng, khôi phục tương tác trang | Đạt |

Stress bao gồm tọa độ lẻ, số đo bằng 0, kéo bốn hướng, sát các ngưỡng đổi bố cục, sát bốn mép, cuộn ngang, cuộn dọc tới 1.000.000 CSS px. Viewport: 1100×800, 356×600, 1920×1080, 320×240, 240×160 và 178×300; có kiểm tra kết hợp viewport nhỏ + tọa độ dài. Các mẫu quét tĩnh dùng Pointer Events giả lập trên con trỏ hoạt động; 420 khung chuyển động dùng chuột thật của trình duyệt. Các thuộc tính kiểm tra: đúng giá trị sáu nhãn, không chồng nhau, không tràn viewport, không cắt số, không bị ô trạng thái che.

Xem [dữ liệu lượt stress cuối](qa/page-ruler/stress-report.json). Đây là bằng chứng cho phạm vi đã kiểm tra, không phải cam kết mọi website và mọi trạng thái trình duyệt đều không thể có lỗi.

## Các lỗi tìm được và đã sửa

1. Ô trạng thái góc trái che nhãn dù sáu nhãn không chồng nhau. Đã dành chỗ cho ô trạng thái khi bố trí nhãn.
2. Trong viewport hẹp, việc giữ các nhãn đầu có thể chia nhỏ khoảng trống khiến nhãn cuối không còn chỗ. Đã thêm cách xếp lại cả sáu nhãn khi cách sửa cục bộ không còn khả thi.
3. Tọa độ dài bị thay bằng dấu “…”. Đã đo chữ và mở rộng nhãn. Khi đồng thời gặp viewport nhỏ, giảm cỡ chữ vừa đủ thay vì cắt số.

Giữ cách bố trí quanh cạnh của Page Ruler khi đủ chỗ. Vẫn dùng cập nhật theo khung hình, giữ tọa độ lẻ khi kéo, chỉ làm tròn số hiển thị.

## Ảnh sau sửa

- [190 × 72, đúng ảnh mới nhất](qa/page-ruler/190x72.png)
- [117 × 72](qa/page-ruler/117x72.png)
- [Góc trên trái](qa/page-ruler/top-left.png)
- [Viewport 240 × 160](qa/page-ruler/small-viewport.png)
- [Tọa độ dài](qa/page-ruler/long-coordinates.png)
- [Viewport nhỏ đồng thời tọa độ dài](qa/page-ruler/small-and-long.png)

## Kiểm tra ngoài phần thước

Đã thử toàn bộ các bộ browser. Auth, auth-drag, JSON, proxy, focus, utilities, ruler, ruler-stress, UI và lifecycle đều có lượt đạt. Utilities có hai lượt timeout ở khôi phục tốc độ video rồi đạt khi chạy lại độc lập; không thay đổi mã YouTube trong đợt sửa thước này. Các lượt kiểm tra riêng không được coi là một lượt tổng hợp toàn bộ cùng đạt.

Editor browser chưa đạt bước kết nối lưu tệp native. Registry `HKCU/Software/Google/Chrome/NativeMessagingHosts/dinkit.editor` trỏ tới `F:/All Project/Extension/remove-short-video-yt/editor/terminal-host/native-host.json`; cả manifest và launcher tại vị trí cũ đều không tồn tại. Đã xác minh bằng thao tác đọc; không đổi đăng ký native host trong đợt kiểm tra thước. Các bài native unit/integration chạy trực tiếp đều đạt 18/18.

Vì vậy không báo `npm run test:browser` toàn bộ đã đạt. Lỗi môi trường Editor và timeout gián đoạn của utilities được ghi tách khỏi kết quả thước. Log từng bộ nằm trong `%TEMP%/dinkit-qa-run`.
