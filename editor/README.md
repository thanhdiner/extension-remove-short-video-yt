# Local Text Editor trong DinKit

Trình soạn thảo được mở từ **DinKit → Trình soạn thảo / Text Editor** trong tab riêng. Ngôn ngữ Việt/Anh dùng chung với DinKit.

## Cài đặt

1. Mở chrome://extensions và chọn Load unpacked, trỏ tới thư mục DinKit cha của thư mục `editor/` này.
2. Bật Allow access to file URLs trong phần Details của extension.
3. Nếu đã cài, reload DinKit và tải lại tab TXT. Native host của bản tích hợp tên `dinkit.editor`; xem [cài đặt từ thư mục DinKit](../README.md#trình-soạn-thảo).

## Sử dụng

- Mở một file .txt bằng Chrome để chuyển tới trang biên tập, hoặc nhấn biểu tượng extension rồi chọn Mở file.
- Kéo cạnh phải Explorer để đổi độ rộng. Tên dài được rút gọn; kéo tiếp qua ngưỡng tối thiểu để thu gọn Explorer. Bấm biểu tượng Explorer để mở lại với độ rộng trước đó. Độ rộng được lưu theo workspace.
- Chuột phải vào thư mục gốc hoặc vùng trống Explorer để thêm thư mục vào workspace, mở cài đặt đường dẫn riêng của thư mục hoặc gỡ thư mục khỏi workspace. Gỡ thư mục giữ nguyên file trên máy và các tab đang mở. Cài đặt thư mục hiện gồm đường dẫn tuyệt đối dùng cho sao chép đường dẫn và nhận diện Git.
- Khi sao chép đường dẫn tuyệt đối lần đầu, bấm **Chọn thư mục…**, chọn lại thư mục gốc đang mở rồi **Lưu và sao chép**. Đường dẫn được ghi nhớ cho thư mục/workspace. Bộ chọn Windows dùng terminal host bên dưới; nếu chưa cài host, vẫn có thể nhập đường dẫn trực tiếp.
- Chọn giao diện Tự động, Sáng hoặc Tối; thiết lập được lưu giữa các lần mở.
- Trong Cài đặt, chọn kiểu nhấp nháy con trỏ: `blink` (mặc định), `smooth`, `phase`, `expand` hoặc `solid` (không nhấp nháy). Áp dụng ngay cho mọi nhóm editor và lưu theo workspace.
- Bật hoặc tắt tự động xuống dòng và tự động lưu ở chân trang.
- Menu Workspace tạo, đổi tên và mở lại các workspace đã lưu trong Chrome. Mỗi workspace tự lưu nhiều thư mục gốc, các tab/nhóm editor, vị trí con trỏ và thiết lập thụt lề, xuống dòng, tự động lưu, tab xem trước. Bản nháp chưa lưu được giữ trong workspace; chỉ thao tác lưu file mới ghi nội dung đó lên ổ đĩa.
- Bấm Split Editor Right ở bất kỳ nhóm nào để thêm nhóm bên phải, không giới hạn cứng số nhóm. Mỗi nhóm có tab, menu và vị trí con trỏ riêng; các nhóm cùng mở một file dùng chung nội dung. Khi không đủ chiều rộng, cuộn ngang vùng soạn thảo để xem các nhóm khác.
- Vùng soạn thảo dùng Monaco Editor, hỗ trợ tô màu cú pháp, thu gọn khối và các thao tác chỉnh sửa quen thuộc của VS Code.
- Tự động lưu chạy sau 1 giây ngừng gõ khi đã có quyền ghi. Nhấn Lưu hoặc Ctrl+S để cấp quyền ghi khi Chrome yêu cầu.
- Menu Terminal trên thanh công cụ mở PowerShell trong ứng dụng. Trên Windows cần Node.js và đăng ký host một lần bằng `powershell -ExecutionPolicy Bypass -File .\editor\terminal-host\install.ps1 -ExtensionId <ID-extension>`; ID nằm ở trang chrome://extensions. Sau đó reload extension để cấp quyền native messaging. Dùng menu ba chấm để chọn thư mục; ứng dụng ghi nhớ lựa chọn. Nếu chưa chọn, terminal dùng thư mục người dùng.
- Thanh terminal có nút tạo phiên, chia đôi, kết thúc phiên, tùy chọn và phóng to. Nút đóng chỉ ẩn terminal; nút thùng rác kết thúc phiên đang chọn.
- File TXT mở bằng `file://` được Ctrl+S/Auto Save ghi thẳng về file gốc khi terminal host đã cài (tối đa 32 MB), không cần chọn lại file. Host kiểm tra nội dung trên ổ đĩa trước khi thay thế file và giữ bản nháp nếu có xung đột. Nếu chưa có host hoặc file vượt giới hạn này, lần lưu đầu vẫn cần chọn file bằng hộp thoại Chrome.
- File đã mở tự nhận thay đổi trên ổ đĩa khi quay lại cửa sổ và khoảng mỗi 1,5 giây khi tab hiển thị. Nếu editor chưa có chỉnh sửa chưa lưu, nội dung mới cập nhật vào mọi khung đang mở file đó và giữ vị trí con trỏ. Khi hai bên cùng sửa, Auto Save tạm dừng và hiện thông báo nhỏ; Ctrl+S không tự mở hộp thoại. Chỉ khi bấm **So sánh và xử lý** mới mở phần chọn **Dùng bản trên ổ đĩa** hoặc **Lưu bản trong editor**. Bản mới trên ổ đĩa được kiểm tra lại trước khi lưu; thay đổi thêm trong lúc so sánh cần xem lại.

## Git / Source Control

- Cần cài Git trên Windows và đăng ký terminal host theo hướng dẫn Terminal phía trên. Sau khi cập nhật, tải lại tab editor; các kết nối host mới dùng code mới.
- Bấm biểu tượng nhánh Git ở thanh bên. Các thư mục workspace đã biết đường dẫn tuyệt đối được tự nhận diện; dùng nút **+** để chọn thêm repository bằng cửa sổ Windows. Danh sách repository chọn thêm được lưu theo workspace.
- Chọn repository để xem nhánh hiện tại, thay đổi, file đã stage và 40 commit gần nhất. Bấm file để xem diff hai cột; file nhị phân và file lớn hơn 1 MB không mở trong diff.
- Kéo thanh ngăn giữa Changes và History để thay đổi chiều cao; có thể chọn thanh bằng bàn phím rồi dùng mũi tên lên/xuống. Nhấp đúp thanh ngăn để về kích thước mặc định; kích thước được lưu theo workspace.
- Bấm **+** cạnh file để stage, **−** để unstage. Nhập thông điệp rồi **Commit** để commit phần đã stage. Hãy lưu nội dung editor trước khi stage; bản nháp chưa lưu không nằm trong Git. Unstage giữ nguyên file trên ổ đĩa.
- Nút **↻** cập nhật trạng thái; khi quay lại cửa sổ editor, Source Control đang mở cũng tự cập nhật. Repository chưa có commit và workspace nhiều repository đều được hỗ trợ.
- Chọn nhánh từ danh sách hoặc bấm **+** cạnh nhánh để tạo nhánh mới. Các nút **Fetch / Pull / Push** dùng remote của upstream (hoặc `origin`); Push chỉ đẩy nhánh hiện tại, không force. Pull chỉ fast-forward và báo lỗi nếu cần merge. Nếu chưa có remote, cấu hình remote trong terminal trước. Xác thực remote dùng cấu hình Git trên máy.
- Menu **⋯** của repository có các nhóm Commit, Changes, Pull/Push, Branch, Remote, Stash, Tags và Worktrees. Clone và thêm worktree yêu cầu nhập đường dẫn tuyệt đối. Stash thông thường chỉ cất file đã theo dõi; chọn **Stash (Include Untracked)** để cất cả file chưa theo dõi. Khi thao tác có thể thay đổi file, hãy lưu hoặc đóng các bản nháp trước.
- **Discard All Changes** bỏ thay đổi chưa stage và xóa file chưa theo dõi sau khi xác nhận; phần đã stage được giữ lại. Commit All đưa cả file chưa theo dõi vào commit sau khi xác nhận. Merge hoặc rebase có thể cần xử lý xung đột; sau lỗi, xem trạng thái Git và xử lý tiếp trong editor hoặc terminal.
- Phần lịch sử hiển thị danh sách commit trên nhánh hiện tại, chưa vẽ đồ thị nhánh đầy đủ. Các tùy chọn Git nâng cao khác dùng terminal.

Kiểm tra Git host: `node --test tests/git-host.test.js` (chỉ dùng repo tạm, remote local). Kiểm tra UI bằng `tests/source-control.browser.js`, sau reload chạy `tests/source-control-reload.browser.js` trong tab `workspaceTest` riêng với hai repo fixture; không chạy trên repo đang làm việc. `tests/source-control-branches.browser.js` dùng remote bare local của fixture để kiểm tra nhánh và Fetch/Pull/Push.

## Giới hạn

- Chrome yêu cầu bật quyền truy cập file://. Nếu không dùng host Windows, cần chọn file để cấp quyền ghi qua Chrome.
- Ứng dụng hỗ trợ văn bản UTF-8, giữ UTF-8 BOM và kiểu xuống dòng khi lưu.
- Ứng dụng từ chối ghi nếu file đã thay đổi trên ổ đĩa, và nhắc trước khi rời trang có thay đổi chưa lưu.

## Kiểm tra nhóm editor

Mở một tab `editor.html?workspaceTest=<mã-duy-nhất>` riêng, chưa mở file, rồi chạy nội dung `tests/editor-groups.browser.js` qua Chrome DevTools `Runtime.evaluate` với `awaitPromise: true`. Kịch bản dùng file và bộ ghi trong bộ nhớ, không sửa file trên ổ đĩa hoặc thiết lập đã lưu. Nó kiểm tra nhiều nhóm, vị trí con trỏ riêng, file dùng chung, lưu đúng file, hủy/đồng ý đóng nhóm chưa lưu, menu từng nhóm và tab xem trước. Đóng tab thử nghiệm sau khi chạy.

Kiểm tra workspace: mở một tab thử nghiệm có `workspaceTest` riêng, chạy `tests/workspace.browser.js` với `Runtime.evaluate`/`awaitPromise`, reload chính tab đó rồi chạy `tests/workspace-reload.browser.js`. Kịch bản dùng file tạm trong OPFS, kiểm tra lưu/khôi phục qua reload, nhiều thư mục và nhóm, bản nháp, thiết lập riêng, file bị sửa bên ngoài và trường hợp lưu workspace thất bại. Sau khi xong, gọi `await localWorkspace.deleteTestDatabase()` rồi đóng tab. Workspace thực và các thiết lập toàn cục không bị thay đổi.

Workspace hiện được lưu trong hồ sơ Chrome đang dùng; chưa xuất/nhập file `.code-workspace` của VS Code. Chrome có thể yêu cầu cấp lại quyền thư mục khi mở lại; Explorer có nút cấp quyền cho từng thư mục.

Kiểm tra đồng bộ file: chạy `tests/file-sync.browser.js` trong tab `workspaceTest` riêng. Kịch bản dùng bộ nhớ, kiểm tra cập nhật các khung, giữ con trỏ, hai cách giải quyết xung đột, thay đổi trong lúc so sánh/đọc file, BOM/xuống dòng và file tạm mất truy cập. Không chạy trên tab đang soạn thảo.
