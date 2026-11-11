"""Test real proxy routing in a temporary Chromium profile; no user traffic is used.
Requires Python Playwright/Chromium and openssl (Git for Windows includes it).
"""
import base64
import json
import os
from pathlib import Path
import select
import shutil
import socket
import socketserver
import ssl
import struct
import subprocess
from tempfile import TemporaryDirectory
from threading import Thread
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect, Error

ROOT = Path(__file__).resolve().parents[1]
HITS = []


def relay(left, right):
    with right:
        while True:
            readable, _, _ = select.select([left, right], [], [], 5)
            if not readable:
                return
            for source in readable:
                data = source.recv(65536)
                if not data:
                    return
                (right if source is left else left).sendall(data)


class Origin(BaseHTTPRequestHandler):
    def do_GET(self):
        HITS.append(('direct', self.path))
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'DIRECT_ORIGIN')

    def log_message(self, *_args):
        pass


class Proxy(Origin):
    def do_GET(self):
        if self.server.auth and self.headers.get('Proxy-Authorization') != 'Basic ' + base64.b64encode(b'user:pass').decode():
            HITS.append(('auth-challenge', self.path))
            self.send_response(407)
            self.send_header('Proxy-Authenticate', 'Basic realm="DinKit-test"')
            self.end_headers()
            return
        HITS.append((self.server.marker, self.path))
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(self.server.marker.encode())

    def do_CONNECT(self):
        HITS.append(('connect', self.path))
        port = int(self.path.rsplit(':', 1)[1])
        remote = socket.create_connection(('127.0.0.1', port), timeout=5)
        self.send_response(200)
        self.end_headers()
        relay(self.connection, remote)


def receive(sock, count):
    data = b''
    while len(data) < count:
        part = sock.recv(count - len(data))
        if not part:
            raise OSError('connection closed')
        data += part
    return data


class Socks(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            self.request.settimeout(5)
            version, count = receive(self.request, 2)
            assert version == 5
            receive(self.request, count)
            self.request.sendall(b'\x05\x00')
            version, command, _, address_type = receive(self.request, 4)
            assert command == 1
            if address_type == 3:
                host = receive(self.request, receive(self.request, 1)[0]).decode()
            elif address_type == 1:
                host = socket.inet_ntop(socket.AF_INET, receive(self.request, 4))
            else:
                host = socket.inet_ntop(socket.AF_INET6, receive(self.request, 16))
            port = struct.unpack('!H', receive(self.request, 2))[0]
            HITS.append(('socks5', host))
            remote = socket.create_connection(('127.0.0.1', port), timeout=5)
            self.request.sendall(b'\x05\x00\x00\x01\x7f\x00\x00\x01\x00\x00')
            relay(self.request, remote)
        except OSError:
            pass


def serve(server):
    Thread(target=server.serve_forever, daemon=True).start()
    return server


def main():
    servers = []
    with TemporaryDirectory(prefix='dinkit-proxy-test-') as temp:
        openssl = shutil.which('openssl') or r'C:\Program Files\Git\usr\bin\openssl.exe'
        cert, key = Path(temp) / 'cert.pem', Path(temp) / 'key.pem'
        subprocess.run([openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(key), '-out', str(cert), '-days', '1', '-subj', '/CN=localhost'], check=True, capture_output=True)
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(cert, key)
        origin = serve(ThreadingHTTPServer(('127.0.0.1', 0), Origin)); servers.append(origin)
        secure_origin = ThreadingHTTPServer(('127.0.0.1', 0), Origin)
        secure_origin.socket = tls.wrap_socket(secure_origin.socket, server_side=True)
        serve(secure_origin); servers.append(secure_origin)
        def proxy(marker, auth=False, secure=False, ipv6=False):
            class Server(ThreadingHTTPServer):
                address_family = socket.AF_INET6 if ipv6 else socket.AF_INET
            server = Server(('::1' if ipv6 else '127.0.0.1', 0), Proxy)
            server.marker, server.auth = marker, auth
            if secure:
                server.socket = tls.wrap_socket(server.socket, server_side=True)
            servers.append(serve(server))
            return server.server_port
        http_port = proxy('HTTP_PROXY')
        auth_port = proxy('AUTH_PROXY', auth=True)
        wrong_auth_port = proxy('WRONG_AUTH_PROXY', auth=True)
        https_port = proxy('HTTPS_PROXY', secure=True)
        ipv6_port = proxy('IPV6_PROXY', ipv6=True)
        socks = serve(socketserver.ThreadingTCPServer(('127.0.0.1', 0), Socks)); servers.append(socks)
        try:
            with sync_playwright() as p:
                context = p.chromium.launch_persistent_context(str(Path(temp) / 'profile'), headless=True, channel='chromium', ignore_https_errors=True,
                    args=[f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}', '--host-resolver-rules=MAP *.dinkit.test 127.0.0.1', '--ignore-certificate-errors'])
                try:
                    worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
                    extension_id = worker.url.split('/')[2]
                    page = context.new_page()
                    page.goto(f'http://alpha.dinkit.test:{origin.server_port}/current?private=value')
                    popup = context.new_page()
                    errors = []
                    popup.on('pageerror', lambda error: errors.append(str(error)))
                    page.bring_to_front()
                    popup.goto(f'chrome-extension://{extension_id}/popup.html')
                    expect(popup.get_by_role('button', name='Proxy', exact=True)).to_be_visible()
                    # Keep the website active, as it is when the extension popup opens.
                    page.bring_to_front()
                    popup.get_by_role('button', name='Proxy', exact=True).evaluate('(button) => button.click()')
                    switch = popup.get_by_role('switch', name='Proxy theo website', exact=True)
                    expect(switch).not_to_be_checked()
                    panel = popup.locator('.proxy-panel').element_handle()
                    popup.get_by_role('button', name='Quay lại', exact=True).click()
                    popup.get_by_role('button', name='Proxy', exact=True).click()
                    assert panel.evaluate('(element) => element === document.querySelector(".proxy-panel")'), 'Proxy navigation must retain its existing content'
                    expect(popup.get_by_role('button', name='Thêm trang hiện tại', exact=True)).to_be_visible()
                    popup.get_by_role('button', name='Thêm trang hiện tại', exact=True).click()
                    expect(popup.get_by_role('textbox', name='Website')).to_have_value('alpha.dinkit.test')
                    popup.get_by_label('Máy chủ proxy').fill('127.0.0.1')
                    popup.get_by_label('Cổng').fill(str(http_port))
                    popup.get_by_role('button', name='Lưu', exact=True).click()
                    expect(popup.locator('.proxy-rules').get_by_text('alpha.dinkit.test', exact=True)).to_be_visible()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    def visit(host, expected, secure=False):
                        expect(switch).to_be_enabled()
                        print('Checking', host, 'HTTPS' if secure else 'HTTP', '->', expected, flush=True)
                        page.goto(f'{"https" if secure else "http"}://{host}:{secure_origin.server_port if secure else origin.server_port}/test', timeout=15000)
                        expect(page.locator('body')).to_contain_text(expected)
                    visit('alpha.dinkit.test', 'DIRECT_ORIGIN')
                    switch.check()
                    visit('alpha.dinkit.test', 'HTTP_PROXY')
                    visit('other.dinkit.test', 'DIRECT_ORIGIN')
                    visit('alpha.dinkit.test', 'DIRECT_ORIGIN', secure=True)
                    assert any(kind == 'connect' for kind, _ in HITS), 'HTTPS must use a CONNECT tunnel'
                    def send(action, **values):
                        result = popup.evaluate('(message) => chrome.runtime.sendMessage({type:"DINKIT_PROXY", ...message})', {'action': action, **values})
                        assert result['ok'], result
                        return result
                    def add(name, scheme, port, host='127.0.0.1', **extra):
                        return send('upsert', rule={'id': name, 'domain': name + '.dinkit.test', 'scheme': scheme, 'host': host, 'port': port, **extra})
                    add('tls', 'https', https_port)
                    visit('tls.dinkit.test', 'HTTPS_PROXY')
                    add('socks', 'socks5', socks.server_address[1])
                    visit('socks.dinkit.test', 'DIRECT_ORIGIN')
                    assert ('socks5', 'socks.dinkit.test') in HITS
                    add('ipv6', 'http', ipv6_port, host='::1')
                    visit('ipv6.dinkit.test', 'IPV6_PROXY')
                    add('auth', 'http', auth_port, username='user', password='pass')
                    visit('auth.dinkit.test', 'AUTH_PROXY')
                    assert any(kind == 'auth-challenge' for kind, _ in HITS)
                    add('wrongauth', 'http', wrong_auth_port, username='wrong', password='wrong')
                    before = sum(kind == 'auth-challenge' for kind, _ in HITS)
                    try:
                        page.goto(f'http://wrongauth.dinkit.test:{origin.server_port}/wrong-auth', timeout=10000)
                        raise AssertionError('Wrong proxy credentials unexpectedly succeeded')
                    except Error:
                        pass
                    attempts = sum(kind == 'auth-challenge' for kind, _ in HITS) - before
                    assert 1 <= attempts <= 2, f'Authentication loop: {attempts} challenges'
                    send('remove', id='wrongauth')
                    # Rules survive popup reload; edits, toggles and deletion change routing.
                    popup.reload()
                    popup.get_by_role('button', name='Proxy', exact=True).click()
                    expect(switch).to_be_checked()
                    popup.get_by_role('switch', name='Bật proxy cho alpha.dinkit.test', exact=True).uncheck()
                    visit('alpha.dinkit.test', 'DIRECT_ORIGIN')
                    popup.get_by_role('switch', name='Bật proxy cho alpha.dinkit.test', exact=True).check()
                    popup.get_by_role('button', name='Sửa alpha.dinkit.test', exact=True).click()
                    popup.get_by_role('combobox', name='Proxy', exact=True).click()
                    popup.get_by_role('option', name='Proxy mới', exact=True).click()
                    popup.get_by_label('Máy chủ proxy').fill('127.0.0.1')
                    popup.get_by_label('Cổng').fill(str(auth_port))
                    popup.get_by_role('button', name='Tài khoản proxy', exact=True).click()
                    popup.get_by_label('Tên đăng nhập', exact=True).fill('user')
                    popup.get_by_label('Mật khẩu', exact=True).fill('pass')
                    popup.get_by_role('button', name='Lưu', exact=True).click()
                    visit('alpha.dinkit.test', 'AUTH_PROXY')
                    popup.get_by_role('button', name='Xóa alpha.dinkit.test', exact=True).click()
                    visit('alpha.dinkit.test', 'DIRECT_ORIGIN')
                    # Import the profiles/routes schema from the supplied Bypass Flow source.
                    source_config = {'enabled': True, 'proxies': [{'id': 'source-http', 'name': 'Shared source', 'type': 'HTTP', 'host': '127.0.0.1', 'port': http_port}], 'routes': [
                        {'id': 'direct-source', 'pattern': 'exempt.source.dinkit.test', 'proxyId': '__DIRECT__'},
                        {'id': 'prefix-source', 'pattern': f'http://prefix.dinkit.test:{origin.server_port}/proxied/', 'proxyId': 'source-http'},
                        {'id': 'all-source', 'pattern': '*.source.dinkit.test', 'proxyId': 'source-http'}]}
                    popup.get_by_role('button', name='Nhập danh sách proxy', exact=True).click()
                    popup.get_by_label('Danh sách hoặc JSON').fill(json.dumps(source_config))
                    popup.get_by_role('button', name='Nhập', exact=True).click()
                    expect(popup.get_by_role('status')).to_contain_text('Đã nhập')
                    visit('a.source.dinkit.test', 'HTTP_PROXY')
                    visit('exempt.source.dinkit.test', 'DIRECT_ORIGIN')
                    visit('source.dinkit.test', 'DIRECT_ORIGIN')
                    page.goto(f'http://prefix.dinkit.test:{origin.server_port}/proxied/story')
                    expect(page.locator('body')).to_contain_text('HTTP_PROXY')
                    visit('prefix.dinkit.test', 'DIRECT_ORIGIN')
                    popup.get_by_role('button', name='Kiểm tra tuyến', exact=True).click()
                    popup.get_by_role('textbox', name='URL', exact=True).fill(f'http://a.source.dinkit.test:{origin.server_port}/test')
                    popup.get_by_role('button', name='Xem tuyến', exact=True).click()
                    expect(popup.get_by_role('status')).to_contain_text(str(http_port))
                    popup.get_by_role('button', name='Thử kết nối', exact=True).click()
                    expect(popup.get_by_role('status')).to_contain_text('HTTP 200')
                    popup.get_by_role('button', name='Sửa exempt.source.dinkit.test', exact=True).click()
                    popup.get_by_role('button', name='Đưa quy tắc xuống', exact=True).click()
                    popup.get_by_role('button', name='Đưa quy tắc xuống', exact=True).click()
                    visit('exempt.source.dinkit.test', 'HTTP_PROXY')
                    popup.get_by_role('button', name='Đưa quy tắc lên', exact=True).click()
                    popup.get_by_role('button', name='Đưa quy tắc lên', exact=True).click()
                    visit('exempt.source.dinkit.test', 'DIRECT_ORIGIN')
                    popup.get_by_role('button', name='Hủy', exact=True).click()
                    # Dead proxy must fail instead of silently connecting directly.
                    dead = socket.socket(); dead.bind(('127.0.0.1', 0)); dead_port = dead.getsockname()[1]; dead.close()
                    add('dead', 'http', dead_port)
                    direct_before = sum(kind == 'direct' for kind, _ in HITS)
                    try:
                        visit('dead.dinkit.test', 'should never load')
                        raise AssertionError('A dead proxy unexpectedly succeeded')
                    except Error as failure:
                        assert 'ERR_PROXY_CONNECTION_FAILED' in str(failure) or 'ERR_TUNNEL_CONNECTION_FAILED' in str(failure), str(failure)
                    assert sum(kind == 'direct' for kind, _ in HITS) == direct_before
                    switch.uncheck()
                    visit('auth.dinkit.test', 'DIRECT_ORIGIN')
                    # Local-only configuration; credentials never enter sync storage.
                    synced = popup.evaluate('chrome.storage.sync.get(null)')
                    assert 'dinkit_proxy' not in synced
                    popup.evaluate('chrome.storage.sync.set({dinkit_language:"en"})')
                    expect(popup.get_by_role('switch', name='Per-site proxy', exact=True)).to_be_visible()
                    popup.set_viewport_size({'width': 356, 'height': 640})
                    popup.get_by_role('button', name='Add website').click()
                    popup.screenshot(path=str(Path(os.environ.get('TEMP', '/tmp')) / 'dinkit-proxy-editor.png'))
                    assert not errors, errors
                    print('PASS: actual HTTP / HTTPS / SOCKS5 / IPv6 proxy traffic, CONNECT, proxy authentication, Bypass Flow import schema, DIRECT exceptions, wildcard and HTTP prefix routes, rule ordering, match/probe, MUI create/edit/delete/toggle, persistence, i18n, dead-proxy failure without DIRECT fallback, local-only credentials.')
                finally:
                    context.close()
        finally:
            for server in servers:
                server.shutdown()
                server.server_close()


if __name__ == '__main__':
    main()
