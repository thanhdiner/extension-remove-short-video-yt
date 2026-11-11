"""Authenticator integration in an isolated Chromium profile; synthetic secrets only.
Requires Python Playwright and its Chromium. Run after npm run build.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'  # RFC 6238 public test key


def main():
    with TemporaryDirectory(prefix='dinkit-auth-test-') as temp, sync_playwright() as p:
        context = p.chromium.launch_persistent_context(str(Path(temp) / 'profile'), channel='chromium', headless=True, accept_downloads=True,
            args=[f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}'])
        try:
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
            extension_id = worker.url.split('/')[2]
            worker.evaluate('chrome.storage.sync.set({dinkit_language:"en"})')
            page = context.new_page()
            page.add_init_script('Date.now = () => 59000')
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'chrome-extension://{extension_id}/popup.html')
            page.get_by_role('button', name='Authenticator', exact=True).click()
            context.grant_permissions(['clipboard-read', 'clipboard-write'])
            expect(page.get_by_text('No accounts yet.', exact=False)).to_be_visible()
            assert not page.evaluate('Boolean(globalThis.dinkitAuthQr)'), 'QR code is loaded only on demand'
            page.get_by_role('button', name='Add account', exact=True).click()
            page.get_by_label('Account name', exact=True).fill('RFC Example')
            page.get_by_label('Secret or otpauth URI').fill(SECRET)
            page.get_by_role('combobox', name='Group', exact=True).fill('Work')
            page.get_by_role('button', name='Advanced', exact=True).click()
            page.get_by_role('combobox', name='Digits', exact=True).click()
            page.get_by_role('option', name='8', exact=True).click()
            page.get_by_role('button', name='Save', exact=True).click()
            code = page.get_by_role('button', name='Copy code for RFC Example', exact=True)
            expect(code).to_have_text('9428 7082')
            code.click()
            expect(page.get_by_role('status')).to_have_text('Copied!')
            assert page.evaluate('navigator.clipboard.readText()') == '94287082'
            print('PASS: add, exact RFC code and clipboard', flush=True)

            def dialog():
                return page.get_by_role('dialog')

            def open_import():
                page.get_by_role('button', name='Import accounts', exact=True).click()

            def import_text(payload):
                open_import()
                dialog().get_by_label('Paste JSON or otpauth URI').fill(payload)
                dialog().get_by_role('button', name='Import accounts', exact=True).click()
                expect(dialog()).not_to_be_visible()

            import_text(json.dumps({'accounts': [
                {'label': 'RFC Example', 'issuer': 'Work', 'secret': SECRET, 'digits': 8},
                {'label': 'Second account', 'issuer': 'Personal', 'secret': 'JBSWY3DPEHPK3PXP'},
            ]}))
            expect(page.get_by_text('2 accounts', exact=True)).to_be_visible()
            expect(page.get_by_role('status')).to_contain_text('Added 1/2')
            page.get_by_label('Search accounts', exact=True).fill('Second')
            expect(page.locator('.auth-account')).to_have_count(1)
            page.get_by_label('Search accounts', exact=True).fill('')
            page.get_by_role('button', name='Change view', exact=True).click()
            expect(page.locator('.auth-grid').first).to_be_visible()
            page.reload()
            page.get_by_role('button', name='Authenticator', exact=True).click()
            expect(page.get_by_text('2 accounts', exact=True)).to_be_visible()
            expect(page.locator('.auth-grid').first).to_be_visible()
            print('PASS: deduplicated import, search, view and IndexedDB persistence', flush=True)

            page.get_by_role('button', name='Manage groups', exact=True).click()
            dialog().get_by_role('button', name='Rename group Work', exact=True).click()
            dialog().get_by_label('Group name', exact=True).fill('Team')
            dialog().get_by_role('button', name='Save', exact=True).click()
            expect(dialog().get_by_text('Team', exact=True)).to_be_visible()
            dialog().get_by_role('button', name='Remove group Team', exact=True).click()
            expect(dialog().get_by_text('Team', exact=True)).not_to_be_visible()
            dialog().get_by_role('button', name='Cancel', exact=True).click()
            expect(page.get_by_text('2 accounts', exact=True)).to_be_visible()
            print('PASS: group rename and removal keep accounts', flush=True)

            page.get_by_role('button', name='Export backup', exact=True).click()
            dialog().get_by_label('Backup password (optional)').fill('synthetic-test-password')
            with page.expect_download() as event:
                dialog().get_by_role('button', name='Export backup', exact=True).click()
            backup = Path(temp) / 'encrypted.json'
            event.value.save_as(backup)
            encrypted = json.loads(backup.read_text(encoding='utf-8'))
            assert encrypted['encrypted'] is True and SECRET not in backup.read_text()
            expect(dialog()).not_to_be_visible()
            open_import()
            dialog().locator('input[type=file]').set_input_files(str(backup))
            dialog().get_by_label('Backup password (optional)').fill('wrong')
            dialog().get_by_role('button', name='Import accounts', exact=True).click()
            expect(dialog().get_by_role('alert')).to_contain_text('Wrong password')
            dialog().get_by_label('Backup password (optional)').fill('synthetic-test-password')
            dialog().get_by_role('button', name='Import accounts', exact=True).click()
            expect(dialog()).not_to_be_visible()
            expect(page.get_by_text('2 accounts', exact=True)).to_be_visible()
            print('PASS: encrypted download, wrong-password error and reimport', flush=True)

            page.get_by_role('button', name='Export Google Authenticator QR', exact=True).click()
            with page.expect_download() as event:
                dialog().get_by_role('button', name='Export backup', exact=True).click()
            qr = Path(temp) / 'google-qr.png'
            event.value.save_as(qr)
            assert qr.read_bytes().startswith(b'\x89PNG')
            expect(dialog()).not_to_be_visible()
            # Repeated QR scans must deduplicate against existing accounts.
            open_import()
            dialog().locator('input[type=file]').set_input_files(str(qr))
            dialog().get_by_role('button', name='Import accounts', exact=True).click()
            expect(dialog()).not_to_be_visible(timeout=15000)
            expect(page.get_by_text('2 accounts', exact=True)).to_be_visible()
            print('PASS: actual QR PNG generation and offline image import', flush=True)

            # MUI confirmation must protect deletion, then restore all accounts from QR.
            page.get_by_role('button', name='Delete all accounts', exact=True).click()
            expect(dialog().get_by_label('DELETE ALL', exact=True)).to_have_count(0)
            dialog().get_by_role('button', name='Continue', exact=True).click()
            expect(dialog().get_by_role('button', name='Delete all accounts', exact=True)).to_be_disabled()
            dialog().get_by_label('DELETE ALL', exact=True).fill('DELETE ALL')
            dialog().get_by_role('button', name='Delete all accounts', exact=True).click()
            expect(dialog()).not_to_be_visible()
            expect(page.locator('.auth-account')).to_have_count(0)
            open_import()
            dialog().locator('input[type=file]').set_input_files(str(qr))
            dialog().get_by_role('button', name='Import accounts', exact=True).click()
            expect(dialog()).not_to_be_visible(timeout=15000)
            expect(page.get_by_text('2 accounts', exact=True)).to_be_visible()
            page.get_by_role('button', name='Actions for RFC Example', exact=True).click()
            page.get_by_role('menuitem', name='Edit account', exact=True).click()
            page.get_by_label('Account name', exact=True).fill('Renamed example')
            page.get_by_role('button', name='Save', exact=True).click()
            expect(page.get_by_role('button', name='Copy code for Renamed example', exact=True)).to_have_text('9428 7082')
            page.get_by_role('button', name='Actions for Second account', exact=True).click()
            page.get_by_role('menuitem', name='Delete', exact=True).click()
            dialog().get_by_role('button', name='Delete', exact=True).click()
            expect(page.get_by_text('1 account', exact=True)).to_be_visible()
            print('PASS: two-stage clear confirmation, QR recovery, edit and individual delete', flush=True)

            # Exercise split Google exports with actual PNGs and multiple-file import.
            many = {'accounts': [{'label': f'Batch {i:02}', 'issuer': 'Batch', 'secret': 'JBSWY3DPEHPK3PXP'} for i in range(11)]}
            import_text(json.dumps(many))
            expect(page.get_by_text('12 accounts', exact=True)).to_be_visible()
            downloads = []
            page.on('download', lambda download: downloads.append(download))
            page.get_by_role('button', name='Export Google Authenticator QR', exact=True).click()
            dialog().get_by_role('button', name='Export backup', exact=True).click()
            expect(dialog()).not_to_be_visible(timeout=15000)
            assert len(downloads) == 2, f'Expected two QR parts, got {len(downloads)}'
            parts = []
            for index, download in enumerate(downloads):
                destination = Path(temp) / f'part-{index}.png'
                download.save_as(destination)
                parts.append(str(destination))
            page.get_by_role('button', name='Delete all accounts', exact=True).click()
            dialog().get_by_role('button', name='Continue', exact=True).click()
            dialog().get_by_label('DELETE ALL', exact=True).fill('DELETE ALL')
            dialog().get_by_role('button', name='Delete all accounts', exact=True).click()
            expect(dialog()).not_to_be_visible()
            open_import()
            dialog().locator('input[type=file]').set_input_files(parts)
            dialog().get_by_role('button', name='Import accounts', exact=True).click()
            expect(dialog()).not_to_be_visible(timeout=15000)
            expect(page.get_by_text('12 accounts', exact=True)).to_be_visible()
            print('PASS: two-part Google QR export and multiple-image recovery', flush=True)
            # No authenticator secret may be exposed through extension storage to content scripts.
            storage = page.evaluate('Promise.all([chrome.storage.local.get(null), chrome.storage.sync.get(null)])')
            assert SECRET not in json.dumps(storage)
            # Shared locale updates without remounting account cards.
            page.evaluate('chrome.storage.sync.set({dinkit_language:"vi"})')
            expect(page.get_by_role('heading', name='Xác thực 2FA', exact=True)).to_be_visible()
            expect(page.get_by_role('button', name='Sao chép mã của Renamed example', exact=True)).to_have_text('9428 7082')
            page.set_viewport_size({'width': 356, 'height': 640})
            page.screenshot(path=str(Path(os.environ.get('TEMP', '/tmp')) / 'dinkit-authenticator.png'))
            assert not errors, errors
            print('PASS: complete Authenticator UI, shared i18n, offline QR, encrypted compatibility, IndexedDB separation and synthetic RFC codes.', flush=True)
        finally:
            context.close()


if __name__ == '__main__':
    main()
