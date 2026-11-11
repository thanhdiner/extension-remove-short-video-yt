"""Exercise account/group drag and persistence in an isolated Chromium profile."""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


def main():
    with TemporaryDirectory(prefix='dinkit-auth-drag-') as profile, sync_playwright() as p:
        context = p.chromium.launch_persistent_context(profile, channel='chromium', headless=True,
            args=[f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}'])
        try:
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
            worker.evaluate('chrome.storage.sync.set({dinkit_language:"en"})')
            page = context.new_page()
            page.goto(f'chrome-extension://{worker.url.split("/")[2]}/popup.html')
            def save(account):
                result = page.evaluate('(account) => chrome.runtime.sendMessage({type:"DINKIT_AUTH", action:"upsert", account})', account)
                assert result['ok'], result
            for key, name, issuer in [('a', 'First', 'Alpha'), ('b', 'Second', 'Beta'), ('c', 'Third', 'Beta')]:
                save({'id': key, 'label': name, 'issuer': issuer, 'secret': 'JBSWY3DPEHPK3PXP', 'digits': 6, 'period': 30, 'algorithm': 'SHA-1'})
            page.get_by_role('button', name='Authenticator', exact=True).click()
            expect(page.locator('.auth-account')).to_have_count(3)
            # Drag groups first; their order is independent from account order.
            page.locator('[aria-label="Drag to reorder group Beta"]').drag_to(page.locator('[aria-label="Drag to reorder group Alpha"]'))
            expect(page.locator('.auth-group-heading h2')).to_have_text(['Beta (2)', 'Alpha (1)'])
            # Drag a card into a different group; its issuer changes and position is visible.
            page.locator('[aria-label="Drag to reorder First"]').drag_to(page.locator('.auth-account[data-account-id="c"]'))
            expect(page.locator('.auth-account')).to_have_count(3)
            assert page.locator('.auth-account').evaluate_all('(nodes) => nodes.map(node => node.dataset.accountId)') == ['b', 'a', 'c']
            page.reload()
            page.get_by_role('button', name='Authenticator', exact=True).click()
            expect(page.locator('.auth-account')).to_have_count(3)
            assert page.locator('.auth-account').evaluate_all('(nodes) => nodes.map(node => node.dataset.accountId)') == ['b', 'a', 'c']
            result = page.evaluate('chrome.runtime.sendMessage({type:"DINKIT_AUTH", action:"state"})')
            assert next(row for row in result['state']['accounts'] if row['id'] == 'a')['issuer'] == 'Beta'
            # Grid view uses the same drag handles and drop targets.
            page.get_by_role('button', name='Change view', exact=True).click()
            expect(page.locator('.auth-grid')).to_be_visible()
            page.locator('[aria-label="Drag to reorder Third"]').drag_to(page.locator('.auth-account[data-account-id="b"]'))
            assert page.locator('.auth-account').evaluate_all('(nodes) => nodes.map(node => node.dataset.accountId)') == ['c', 'b', 'a']
            print('PASS: group drag, cross-group account drag, grid drag and persistence after reload.')
        finally:
            context.close()


if __name__ == '__main__':
    main()
