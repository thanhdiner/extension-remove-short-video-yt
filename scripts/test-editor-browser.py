"""Exercise the merged editor in an isolated Chromium profile and temporary files."""
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
from urllib.parse import urlencode
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


def main():
    with TemporaryDirectory(prefix='dinkit-editor-test-') as temp, sync_playwright() as p:
        context = p.chromium.launch_persistent_context(str(Path(temp) / 'profile'), channel='chromium', headless=True,
            args=[f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}'])
        errors = []
        context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(f'{page.url}: {error.stack}')))
        try:
            # A persistent Chrome window exits when its last tab is closed.
            anchor = context.new_page()
            anchor.goto('about:blank')
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
            extension_id = worker.url.split('/')[2]
            base = f'chrome-extension://{extension_id}'
            worker.evaluate('chrome.storage.sync.set({dinkit_language:"en"})')
            popup = context.new_page()
            popup.goto(f'{base}/popup.html')
            with context.expect_page() as event:
                popup.get_by_role('button', name='Text Editor', exact=True).click()
            editor = event.value
            editor.wait_for_url(f'{base}/editor/editor.html')
            editor.wait_for_function('() => Boolean(window.localWorkspace)')
            editor.evaluate('localWorkspace.ready')
            expect(editor.locator('html')).to_have_attribute('lang', 'en')
            print('PASS: DinKit menu opens the full editor; shared English preference', flush=True)
            count = len(context.pages)
            popup.get_by_role('button', name='Text Editor', exact=True).click()
            expect(editor).to_have_url(f'{base}/editor/editor.html')
            assert len(context.pages) == count
            print('PASS: reopening from the menu reuses the existing editor tab', flush=True)

            worker.evaluate('chrome.storage.sync.set({dinkit_language:"vi"})')
            expect(editor.locator('html')).to_have_attribute('lang', 'vi')
            editor.locator('#settings-btn').click()
            editor.locator('#language-select').click()
            editor.locator('#language-options [data-value="en"]').click()
            expect(editor.locator('html')).to_have_attribute('lang', 'en')
            expect(popup.get_by_role('button', name='Text Editor', exact=True)).to_be_visible()
            assert worker.evaluate('chrome.storage.sync.get("dinkit_language")')['dinkit_language'] == 'en'
            editor.locator('#settings-close').click()
            popup.close()
            print('PASS: shared language updates in both directions', flush=True)

            result = editor.evaluate('''async () => {
                const model = monaco.editor.createModel('const answer: = 1;', 'typescript', monaco.Uri.parse('inmemory://test/integration.ts'));
                try {
                    const accessor = await monaco.languages.typescript.getTypeScriptWorker();
                    const service = await accessor(model.uri);
                    const diagnostics = await service.getSyntacticDiagnostics(model.uri.toString());
                    if (!diagnostics.length) throw Error('TypeScript worker did not validate the file');
                    return diagnostics.length;
                } finally { model.dispose(); }
            }''')
            assert result > 0
            print('PASS: namespaced Monaco TypeScript worker executes diagnostics', flush=True)
            editor.close()

            fixture = Path(temp) / 'note # có dấu %.txt'
            content = '{"message":"local TXT must stay editable","number":123}\n'
            fixture.write_text(content, encoding='utf-8')
            local = context.new_page()
            local.goto(fixture.as_uri())
            local.wait_for_url(f'{base}/editor/editor.html?file=*')
            local.wait_for_function('() => typeof activeTab !== "undefined" && activeTab !== null')
            assert local.evaluate('editor.getValue()') == content
            assert local.evaluate('activeTab.sourceUrl') == fixture.as_uri()
            assert local.locator('#dinkit-json-viewer').count() == 0
            assert fixture.read_text(encoding='utf-8') == content
            print('PASS: local TXT redirects, reads encoded path and avoids JSON collision', flush=True)
            local.close()

            def run_case(name, namespace):
                page = context.new_page()
                page.goto(f'{base}/editor/editor.html?workspaceTest={namespace}')
                page.wait_for_function('() => Boolean(window.localWorkspace)')
                page.evaluate('localWorkspace.ready')
                result = page.evaluate((ROOT / 'editor/tests' / name).read_text(encoding='utf-8'))
                print(f'PASS: {name}: {result}', flush=True)
                return page

            groups = run_case('editor-groups.browser.js', 'groups')
            groups.close()
            workspace = run_case('workspace.browser.js', 'persistence')
            workspace.reload()
            workspace.wait_for_function('() => Boolean(window.localWorkspace)')
            workspace.evaluate('localWorkspace.ready')
            result = workspace.evaluate((ROOT / 'editor/tests/workspace-reload.browser.js').read_text(encoding='utf-8'))
            print(f'PASS: workspace reload: {result}', flush=True)
            workspace.evaluate('localFileSync.stop(); localWorkspace.deleteTestDatabase()')
            workspace.close()
            sync = run_case('file-sync.browser.js', 'file-sync')
            sync.close()
            fallback = run_case('native-files-fallback.browser.js', 'fallback')
            fallback.close()
            for filename in ['explorer-resize.browser.js', 'explorer-workspace-menu.browser.js', 'root-path.browser.js', 'source-control-multirepo.browser.js', 'source-control-resize.browser.js']:
                extra = run_case(filename, filename.replace('.browser.js', ''))
                extra.close()
            cursor = run_case('cursor-blinking.browser.js', 'cursor-blinking')
            cursor.reload()
            cursor.wait_for_function('() => Boolean(window.localWorkspace)')
            cursor.evaluate('localWorkspace.ready')
            result = cursor.evaluate((ROOT / 'editor/tests/cursor-blinking-reload.browser.js').read_text(encoding='utf-8'))
            print(f'PASS: cursor settings after reload: {result}', flush=True)
            cursor.evaluate('localFileSync.stop(); localWorkspace.deleteTestDatabase()')
            cursor.close()

            # Two tabs read the same revision. Their drafts must survive independently.
            conflict_url = f'{base}/editor/editor.html?workspaceTest=concurrent-sessions'
            def open_session():
                page = context.new_page()
                page.goto(conflict_url)
                page.wait_for_function('() => Boolean(window.localWorkspace)')
                page.evaluate('localWorkspace.ready')
                page.evaluate('''async () => {
                    clearTimeout(localWorkspace.timer);
                    localWorkspace.scheduleSave = () => {};
                    document.removeEventListener('visibilitychange', localWorkspace.visibility);
                    window.removeEventListener('pagehide', localWorkspace.unload);
                    await localWorkspace.writes;
                }''')
                return page
            first = open_session()
            original_id = first.evaluate('localWorkspace.current.id')
            second = open_session()
            assert second.evaluate('localWorkspace.current.id') == original_id
            def draft(page, content):
                page.evaluate('''async content => {
                    elements.autosave.checked = false;
                    await installContent(new TextEncoder().encode(content), 'draft.txt', '', null);
                    clearTimeout(localWorkspace.timer);
                }''', content)
            draft(first, 'first tab unsaved draft')
            first.evaluate('localWorkspace.saveNow()')
            draft(second, 'second tab unsaved draft')
            second.evaluate('Promise.all([localWorkspace.saveNow(), localWorkspace.saveNow(), localWorkspace.saveNow()])')
            copy_id = second.evaluate('localWorkspace.current.id')
            assert copy_id != original_id
            records = second.evaluate('''async ids => Promise.all(ids.map(id => localWorkspace.store.get(id)))''', [original_id, copy_id])
            assert [record['documents'][0]['text'] for record in records] == ['first tab unsaved draft', 'second tab unsaved draft']
            assert len(second.evaluate('localWorkspace.store.list()')) == 2, 'queued saves must reuse a single recovery copy'
            second.evaluate('localWorkspace.saveNow()')
            assert second.evaluate('localWorkspace.current.id') == copy_id
            assert second.evaluate('currentError') == ''
            second.reload()
            second.wait_for_function('() => Boolean(window.localWorkspace)')
            second.evaluate('localWorkspace.ready')
            assert second.evaluate('localWorkspace.current.id') == copy_id
            assert second.evaluate('editor.getValue()') == 'second tab unsaved draft'
            first.close()
            second.evaluate('localFileSync.stop(); localWorkspace.deleteTestDatabase()')
            second.close()
            print('PASS: concurrent workspace drafts, queued saves and reload retain both sessions without conflict errors', flush=True)

            native_file = Path(temp) / 'local-editor-save-ui-integration.txt'
            native_file.write_bytes(b'\xef\xbb\xbforiginal\r\n')
            native = context.new_page()
            query = urlencode({'workspaceTest': 'native-files', 'file': native_file.as_uri()})
            native.goto(f'{base}/editor/editor.html?{query}')
            native.wait_for_function('() => Boolean(window.localWorkspace)')
            native.evaluate('localWorkspace.ready')
            result = native.evaluate((ROOT / 'editor/tests/native-files.browser.js').read_text(encoding='utf-8'))
            print(f'PASS: native saves and auto save: {result}', flush=True)
            native.reload()
            native.wait_for_function('() => Boolean(window.localWorkspace)')
            native.evaluate('localWorkspace.ready')
            result = native.evaluate((ROOT / 'editor/tests/native-files-reload.browser.js').read_text(encoding='utf-8'))
            assert native_file.read_bytes() == b'\xef\xbb\xbfsaved after reload\r\n'
            print(f'PASS: native save after reload: {result}', flush=True)

            result = native.evaluate('''() => new Promise((resolve, reject) => {
                const port = chrome.runtime.connectNative('dinkit.editor');
                const timer = setTimeout(() => finish(Error('Terminal host timeout')), 15000);
                let output = '';
                const finish = error => { clearTimeout(timer); port.disconnect(); error ? reject(error) : resolve(true); };
                port.onDisconnect.addListener(() => { if (chrome.runtime.lastError) finish(Error(chrome.runtime.lastError.message)); });
                port.onMessage.addListener(message => {
                    if (message.type === 'error') finish(Error(message.message));
                    if (message.type === 'started') port.postMessage({type:'input', data:"Write-Output ('DINKIT_' + 'TERMINAL_OK')\\r"});
                    if (message.type === 'data') {
                        output += message.data;
                        if (output.includes('DINKIT_TERMINAL_OK')) finish();
                    }
                });
                port.postMessage({type:'start', cols:80, rows:24});
            })''')
            assert result
            print('PASS: real PowerShell terminal through DinKit native messaging', flush=True)
            native.close()

            repos = [Path(temp) / 'seeded-repo', Path(temp) / 'unborn-repo']
            def git(repo, *args):
                return subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True, text=True)
            for repo in repos:
                repo.mkdir()
                git(repo, 'init', '-b', 'main')
                git(repo, 'config', 'user.name', 'DinKit Test')
                git(repo, 'config', 'user.email', 'test@example.invalid')
                git(repo, 'config', 'commit.gpgsign', 'false')
                git(repo, 'config', 'core.autocrlf', 'false')
            (repos[0] / 'tracked.txt').write_text('old line\n', encoding='utf-8')
            git(repos[0], 'add', '.')
            git(repos[0], 'commit', '-m', 'Initial fixture')
            remote = Path(temp) / 'remote.git'
            subprocess.run(['git', 'init', '--bare', str(remote)], check=True, capture_output=True)
            git(repos[0], 'remote', 'add', 'origin', str(remote))
            git(repos[0], 'push', '-u', 'origin', 'main')
            (repos[0] / 'tracked.txt').write_text('new line\n', encoding='utf-8')
            (repos[0] / 'new file.txt').write_text('untracked\n', encoding='utf-8')
            (repos[1] / 'first.txt').write_text('first\n', encoding='utf-8')
            source = context.new_page()
            source.goto(f'{base}/editor/editor.html?workspaceTest=git')
            source.wait_for_function('() => Boolean(window.localWorkspace)')
            source.evaluate('localWorkspace.ready')
            source.evaluate('paths => { window.gitTestPaths = paths; }', [str(repo) for repo in repos])
            result = source.evaluate((ROOT / 'editor/tests/source-control.browser.js').read_text(encoding='utf-8'))
            print(f'PASS: Source Control diff, stage, unstage and commit: {result}', flush=True)
            source.reload()
            source.wait_for_function('() => Boolean(window.localWorkspace)')
            source.evaluate('localWorkspace.ready')
            result = source.evaluate((ROOT / 'editor/tests/source-control-reload.browser.js').read_text(encoding='utf-8'))
            print(f'PASS: Source Control after reload: {result}', flush=True)
            result = source.evaluate((ROOT / 'editor/tests/source-control-branches.browser.js').read_text(encoding='utf-8'))
            print(f'PASS: Source Control branches, Fetch/Pull/Push and draft protection: {result}', flush=True)
            source.close()
            assert not errors, '\n'.join(errors)
            print('PASS: no editor or popup runtime errors', flush=True)
        finally:
            context.close()


if __name__ == '__main__':
    main()
