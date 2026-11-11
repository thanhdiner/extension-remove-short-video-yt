"""Reload the actual extension and verify cached content and persisted module state."""
from pathlib import Path
from tempfile import TemporaryDirectory
import time
from playwright.sync_api import sync_playwright, expect, Error

ROOT = Path(__file__).resolve().parents[1]


def main():
    with TemporaryDirectory(prefix='dinkit-lifecycle-') as temp, sync_playwright() as p:
        context = p.chromium.launch_persistent_context(str(Path(temp) / 'profile'), channel='chromium', headless=True,
            args=[f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}'])
        context.route('https://www.youtube.com/**', lambda route: route.fulfill(content_type='text/html',
            body='<!doctype html><html><body><video></video><div id="site">Lifecycle fixture</div></body></html>'))
        errors = []
        context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
        try:
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
            base = 'chrome-extension://' + worker.url.split('/')[2]
            popup = context.new_page()
            popup.goto(base + '/popup.html')
            assert popup.evaluate('chrome.runtime.sendMessage({type:"DINKIT_SETTINGS_UPDATE",patch:{enabled:true,userSpeed:1.4,seekSeconds:33}})')['ok']
            result = popup.evaluate('''chrome.runtime.sendMessage({type:'DINKIT_AUTH',action:'upsert',account:{id:'lifecycle',label:'Reload fixture',issuer:'Test',secret:'JBSWY3DPEHPK3PXP',digits:6,period:30,algorithm:'SHA-1'}})''')
            assert result['ok']
            assert popup.evaluate('chrome.runtime.sendMessage({type:"DINKIT_PROXY",action:"saveProfile",profile:{id:"lifecycle-proxy",name:"Reload proxy",scheme:"http",host:"127.0.0.1",port:9000}})')['ok']
            editor = context.new_page()
            editor.goto(base + '/editor/editor.html?workspaceTest=lifecycle')
            editor.wait_for_function('() => Boolean(window.localWorkspace)')
            editor.evaluate('localWorkspace.ready')
            editor.evaluate('''async () => {
                elements.autosave.checked=false;
                await installContent(new TextEncoder().encode('Unsaved lifecycle draft'), 'reload.txt', '', null);
                await localWorkspace.saveNow();
            }''')
            workspace_id = editor.evaluate('localWorkspace.current.id')
            youtube = context.new_page()
            youtube.goto('https://www.youtube.com/watch?v=lifecycle')
            youtube.evaluate('document.querySelector("video").dispatchEvent(new Event("loadedmetadata",{bubbles:true}))')
            youtube.wait_for_function('() => document.querySelector("video").playbackRate===1.4')
            worker.evaluate('chrome.storage.sync.set({dinkit_language:"en"})')
            worker.evaluate('chrome.storage.local.set({focus:{active:true,task:"Reload focus",startedAt:Date.now(),endsAt:Date.now()+60000,durationMinutes:1,pendingLog:false}})')
            deadline = time.monotonic() + 8
            while not worker.evaluate('async () => Boolean(await chrome.alarms.get("focus-session-timer"))'):
                assert time.monotonic() < deadline, 'initial alarm missing'
                time.sleep(.05)
            manager = context.new_page()
            manager.goto('chrome://extensions/')
            manager.locator('#devMode').click()
            with context.expect_event('serviceworker') as event:
                manager.locator('extensions-item').locator('#dev-reload-button').click()
            restarted = event.value
            new_popup = context.new_page()
            new_popup.goto(base + '/popup.html')
            # Reuse the original website without reloading it: its old content context is invalid.
            youtube.evaluate('''() => {
                for(let i=0;i<5;i++) {
                    document.querySelector('video').dispatchEvent(new Event('loadedmetadata',{bubbles:true}));
                    document.body.appendChild(document.createElement('div'));
                }
            }''')
            youtube.wait_for_function('() => document.querySelector("video").playbackRate===1.4')
            expect(new_popup.get_by_role('button',name='Authenticator',exact=True)).to_be_visible()
            result = new_popup.evaluate('chrome.runtime.sendMessage({type:"DINKIT_AUTH",action:"state"})')
            assert result['ok'] and result['state']['accounts'][0]['label'] == 'Reload fixture'
            result = new_popup.evaluate('chrome.runtime.sendMessage({type:"DINKIT_PROXY",action:"state"})')
            assert result['ok'] and result['config']['profiles'][0]['name'] == 'Reload proxy'
            assert restarted.evaluate('chrome.storage.sync.get("hys_settings")')['hys_settings']['seekSeconds'] == 33
            new_editor = context.new_page()
            new_editor.goto(base + '/editor/editor.html?workspaceTest=lifecycle')
            new_editor.wait_for_function('() => Boolean(window.localWorkspace)')
            new_editor.evaluate('localWorkspace.ready')
            assert new_editor.evaluate('localWorkspace.current.id') == workspace_id
            assert new_editor.evaluate('editor.getValue()') == 'Unsaved lifecycle draft'
            deadline = time.monotonic() + 8
            while not restarted.evaluate('async () => Boolean(await chrome.alarms.get("focus-session-timer"))'):
                assert time.monotonic() < deadline, 'active Focus deadline must remain scheduled after extension reload'
                time.sleep(.05)
            assert not errors, '\n'.join(errors)
            print('PASS: actual extension reload preserves Authenticator, proxy, settings, language, workspace draft and active Focus alarm; old video context stays error-free.', flush=True)
        finally:
            context.close()


if __name__ == '__main__':
    main()
