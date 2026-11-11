"""Real extension smoke/regression test in an isolated headless Chromium profile.

Requires Python playwright and its Chromium: pip install playwright; playwright install chromium
Run from the repo: python scripts/test-json-browser.py
"""
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import json
import os

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
RAW = '{"large":9007199254740993123456789,"same":1,"same":2,"escaped":"\\u0061","nested":[{"name":"Tiếng Việt 😀"}],"markup":"<img src=x onerror=alert(1)>"}'
REQUESTS = Counter()
FIXTURES = {
    "/valid": ("application/json", RAW),
    "/vendor": ("application/problem+json", '{"detail":"not found"}'),
    "/plain": ("text/plain", '[1,true,null,"text"]'),
    "/invalid": ("application/json", '{"trailing":1,}'),
    "/html": ("text/html", '<!doctype html><title>Example</title><pre>{"a":1}</pre>'),
    "/deep": ("application/json", '[' * 100 + '1' + ']' * 100),
    "/large": ("application/json", '[' + '1,' * 11000 + '2]'),
    "/oversize": ("application/json", '"' + 'x' * (5 * 1024 * 1024) + '"'),
    "/primitive": ("application/json", 'null'),
    "/iframe": ("text/html", '<!doctype html><iframe src="/valid"></iframe>'),
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        REQUESTS[self.path] += 1
        mime, value = FIXTURES.get(self.path, ("text/plain", "not found"))
        payload = value.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", mime + "; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'none'; frame-src 'self'; style-src 'none'; script-src 'none'")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        pass


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        with TemporaryDirectory(prefix="dinkit-json-browser-") as profile, sync_playwright() as p:
            args = [f"--disable-extensions-except={ROOT}", f"--load-extension={ROOT}"]
            context = p.chromium.launch_persistent_context(profile, channel="chromium", headless=True, args=args)
            try:
                worker = context.service_workers[0] if context.service_workers else context.wait_for_event("serviceworker")
                extension_id = worker.url.split('/')[2]
                errors = []
                worker.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
                page = context.new_page()
                page.on("pageerror", lambda error: errors.append(str(error)))
                popup = context.new_page()
                popup.goto(f"chrome-extension://{extension_id}/popup.html")
                assert popup.evaluate("new Promise(resolve => chrome.extension.isAllowedFileSchemeAccess(resolve))"), "Enable Allow access to file URLs in the isolated test profile"
                popup.get_by_role("button", name="Tiện ích trình duyệt").click()
                switch = popup.get_by_role("switch", name="JSON Formatter")
                expect(switch).to_be_checked()
                page.goto(base + "/valid")
                expect(page.locator("#dinkit-json-viewer .key").first).to_be_visible()
                expect(page.locator(".code")).to_contain_text("9007199254740993123456789")
                assert page.locator("#dinkit-json-viewer img").count() == 0
                page.get_by_role("button", name="Thu gọn tất cả").click()
                expect(page.locator(".line")).to_have_count(1)
                page.get_by_role("button", name="Mở rộng tất cả").click()
                assert page.locator(".line").count() > 1
                page.get_by_role("button", name="Bản gốc", exact=True).click()
                expect(page.locator(".code pre")).to_have_text(RAW)
                context.grant_permissions(["clipboard-read", "clipboard-write"], origin=base)
                page.get_by_role("button", name="Sao chép", exact=True).click()
                expect(page.get_by_role("status")).to_have_text("Đã sao chép!")
                assert page.evaluate("navigator.clipboard.readText()") == RAW
                popup.evaluate("chrome.storage.sync.set({dinkit_language:'en'})")
                expect(page.get_by_role("button", name="Raw", exact=True)).to_be_visible()
                switch.uncheck()
                expect(page.locator("#dinkit-json-viewer")).to_have_count(0)
                expect(page.locator("body > pre")).to_have_text(RAW)
                switch.check()
                expect(page.locator("#dinkit-json-viewer .key").first).to_be_visible()
                assert REQUESTS["/valid"] == 1, "Formatting must not re-fetch an API response"
                page.reload()
                expect(page.locator("#dinkit-json-viewer .key").first).to_be_visible()
                for path in ["/vendor", "/plain", "/primitive"]:
                    page.goto(base + path)
                    expect(page.locator("#dinkit-json-viewer .code")).to_be_visible()
                for path in ["/invalid", "/html", "/oversize"]:
                    page.goto(base + path)
                    page.wait_for_timeout(200)
                    expect(page.locator("#dinkit-json-viewer")).to_have_count(0)
                    expect(page.locator("body > pre")).to_have_text(FIXTURES[path][1] if path != "/html" else '{"a":1}')
                for path in ["/deep", "/large"]:
                    page.goto(base + path)
                    expect(page.locator("#dinkit-json-viewer .code pre")).to_be_visible()
                    assert json.loads(page.locator(".code pre").inner_text()) == json.loads(FIXTURES[path][1])
                page.goto(base + "/iframe")
                page.wait_for_timeout(200)
                expect(page.locator("#dinkit-json-viewer")).to_have_count(0)
                expect(page.frame_locator("iframe").locator("#dinkit-json-viewer")).to_have_count(0)
                # Preference persists across navigation, with no rewrite while disabled.
                switch.uncheck()
                page.goto(base + "/valid")
                page.wait_for_timeout(200)
                expect(page.locator("#dinkit-json-viewer")).to_have_count(0)
                switch.check()
                expect(page.locator("#dinkit-json-viewer .key").first).to_be_visible()
                page.set_viewport_size({"width": 360, "height": 640})
                page.screenshot(path=str(Path(os.environ.get("TEMP", "/tmp")) / "dinkit-json-mobile.png"))
                page.set_viewport_size({"width": 1280, "height": 800})
                page.screenshot(path=str(Path(os.environ.get("TEMP", "/tmp")) / "dinkit-json-desktop.png"))
                # Reproduce a JSON backup opened from disk, including Unicode/spaces in its path.
                local_json = Path(profile) / "bản sao lưu JSON.json"
                local_json.write_text(RAW, encoding="utf-8")
                page.goto(local_json.as_uri())
                expect(page.locator("#dinkit-json-viewer .key").first).to_be_visible()
                expect(page.locator(".code")).to_contain_text("9007199254740993123456789")
                page.get_by_role("button", name="Raw", exact=True).click()
                expect(page.locator(".code pre")).to_have_text(RAW)
                switch.uncheck()
                expect(page.locator("#dinkit-json-viewer")).to_have_count(0)
                expect(page.locator("body > pre")).to_have_text(RAW)
                switch.check()
                expect(page.locator("#dinkit-json-viewer .key").first).to_be_visible()
                page.reload()
                expect(page.locator("#dinkit-json-viewer .key").first).to_be_visible()
                assert not errors, errors
                print("PASS: actual extension injection, local file JSON (Unicode path, raw, live restore and reload), MUI switch, fold, raw, copy, i18n, live restore, reload, MIME types, invalid/HTML/oversize/deep/wide JSON, iframe exclusion, strict CSP and no API re-fetch.")
            finally:
                context.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
