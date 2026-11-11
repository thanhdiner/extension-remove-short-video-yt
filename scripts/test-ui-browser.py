"""Check DinKit page sizing, dialogs and menus; save synthetic UI screenshots."""
from pathlib import Path
from tempfile import TemporaryDirectory, gettempdir
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
IMAGES = Path(gettempdir()) / 'dinkit-qa-ui'


def main():
    IMAGES.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix='dinkit-ui-') as temp, sync_playwright() as p:
        context = p.chromium.launch_persistent_context(str(Path(temp) / 'profile'), channel='chromium', headless=True,
            viewport={'width':356,'height':600}, args=[f'--disable-extensions-except={ROOT}',f'--load-extension={ROOT}'])
        errors = []
        context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
        try:
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
            base = 'chrome-extension://' + worker.url.split('/')[2]
            worker.evaluate('chrome.storage.sync.set({dinkit_language:"en"})')
            page = context.new_page()
            page.goto(base + '/popup.html')
            def capture(name):
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'horizontal overflow: {name}'
                page.screenshot(path=str(IMAGES / f'{name}.png'), full_page=True)
            expect(page.get_by_role('button',name='Text Editor',exact=True)).to_be_visible()
            capture('home-en')
            for title in ['YouTube','Browser utilities','Focus Firewall','Proxy','Language']:
                page.get_by_role('button', name=title, exact=True).click()
                expect(page.get_by_role('heading',name=title,exact=True)).to_be_visible()
                capture(title.lower().replace(' ', '-'))
                if title == 'Language':
                    page.get_by_role('combobox',name='Language',exact=True).click()
                    expect(page.get_by_role('option',name='Tiếng Việt',exact=True)).to_be_visible()
                    page.keyboard.press('Escape')
                page.get_by_role('button',name='Back',exact=True).click()

            for index in range(6):
                result = page.evaluate('''account => chrome.runtime.sendMessage({type:'DINKIT_AUTH',action:'upsert',account})''',
                    {'id':f'ui-{index}','label':f'Long account label {index} for UI verification','issuer':'Synthetic group','secret':'JBSWY3DPEHPK3PXP','digits':6,'period':30,'algorithm':'SHA-1'})
                assert result['ok']
            page.get_by_role('button',name='Authenticator',exact=True).click()
            expect(page.locator('.auth-account')).to_have_count(6)
            expect(page.locator('.auth-group-count')).to_have_text('(6)')
            capture('auth-list')
            assert page.locator('.popup-proxy').evaluate('el=>el.scrollHeight>el.clientHeight')
            page.get_by_role('button',name='Change view',exact=True).click()
            expect(page.locator('.auth-grid')).to_be_visible()
            capture('auth-grid')
            page.get_by_role('button',name='Import accounts',exact=True).click()
            dialog = page.get_by_role('dialog')
            expect(dialog).to_be_visible()
            assert dialog.evaluate('el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}')
            capture('auth-import')
            page.keyboard.press('Escape')
            page.get_by_role('button',name='Back',exact=True).click()
            worker.evaluate('chrome.storage.sync.set({dinkit_language:"vi"})')
            expect(page.get_by_role('button',name='Ngôn ngữ',exact=True)).to_be_visible()
            capture('home-vi')

            page.set_viewport_size({'width':1100,'height':800})
            page.goto(base + '/focus/options.html')
            for title in ['Quy tắc','Chế độ','Thống kê','Khác']:
                page.get_by_role('button',name=title,exact=True).click()
                expect(page.locator('.options-page:not([hidden])')).to_be_visible()
                capture('options-' + {'Quy tắc':'rules','Chế độ':'modes','Thống kê':'stats','Khác':'more'}[title])
                if title == 'Chế độ':
                    page.locator('.preset-help button').first.click()
                    expect(page.get_by_role('tooltip')).to_be_visible()
                    page.locator('.page-heading').filter(has_text='Chế độ').click()
                    expect(page.get_by_role('tooltip')).to_have_count(0)
                    page.locator('#feed-topics-header').click()
                    expect(page.locator('#feed-topics-header')).to_have_attribute('aria-expanded','true')
                    expect(page.locator('#feed-topics-mui input').first).to_be_visible()
                    page.locator('#feed-topics-header').click()
                    expect(page.locator('#feed-topics-header')).to_have_attribute('aria-expanded','false')
            page.set_viewport_size({'width':390,'height':800})
            for title in ['Quy tắc','Chế độ','Thống kê','Khác']:
                page.get_by_role('button',name=title,exact=True).click()
                capture('narrow-' + {'Quy tắc':'rules','Chế độ':'modes','Thống kê':'stats','Khác':'more'}[title])
            assert not errors, '\n'.join(errors)
            print(f'PASS: English/Vietnamese popup, every menu, Authenticator list/grid/import, scroll area, and all Options tabs at desktop/narrow widths. Screenshots: {IMAGES}', flush=True)
        finally:
            context.close()


if __name__ == '__main__':
    main()
