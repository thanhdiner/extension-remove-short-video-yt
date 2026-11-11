"""Verify Focus Firewall and Healthy Feed using an isolated Chrome profile."""
from pathlib import Path
from tempfile import TemporaryDirectory
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import json
import time
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
POSTS = '''<!doctype html><html><body><nav role="navigation">Navigation stays visible</nav><main role="main"><div role="feed">
<article role="article" id="tech" style="height:180px"><h3><a href="/research">Research</a></h3><a href="/research/posts/one">Time</a><div data-ad-preview="message">Programming research and open source science education.</div></article>
<article role="article" id="ad"><h3><a href="/advertiser">Ad source</a></h3><span aria-label="Sponsored">Sponsored</span><div data-ad-preview="message">Buy now</div></article>
<article role="article" id="reel"><a href="/reel/one">Reels</a></article>
<article role="article" id="fun"><h3><a href="/fun">Fun</a></h3><div data-ad-preview="message">meme drama showbiz</div></article>
</div></main></body></html>'''


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(b'<!doctype html><html><body>Local focus fixture</body></html>')

    def log_message(self, *args):
        pass


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with TemporaryDirectory(prefix='dinkit-focus-') as temp, sync_playwright() as p:
            context = p.chromium.launch_persistent_context(str(Path(temp) / 'profile'), channel='chromium', headless=True,
                accept_downloads=True, args=[f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}'])
            context.set_default_timeout(10000)
            errors = []
            context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(f'{page.url}: {error}')))
            context.route('https://www.facebook.com/**', lambda route: route.fulfill(content_type='text/html', body=POSTS))
            try:
                worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
                base = 'chrome-extension://' + worker.url.split('/')[2]
                worker.evaluate('chrome.storage.sync.set({dinkit_language:"en"})')
                def wait(predicate, message, seconds=8):
                    until = time.monotonic() + seconds
                    while time.monotonic() < until:
                        if worker.evaluate(predicate):
                            return
                        time.sleep(.05)
                    raise AssertionError(message)
                wait('async () => Boolean((await chrome.storage.local.get("lastResetDate")).lastResetDate)', 'installation finished')
                options = context.new_page()
                options.on('dialog', lambda dialog: dialog.accept())
                options.goto(base + '/focus/options.html')
                options.locator('#blocklist-input').fill('127.0.0.1')
                options.locator('#blocklist-add-btn').click()
                expect(options.locator('#blocklist-list')).to_contain_text('127.0.0.1')
                focus = context.new_page()
                focus.goto(base + '/focus/popup.html')
                focus.locator('[data-duration="25"]').click()
                expect(focus.locator('#input-error')).to_be_visible()
                focus.locator('#task-input').fill('Complete audit')
                focus.locator('[data-duration="25"]').click()
                expect(focus.locator('#focus-active-view')).to_be_visible()
                wait('async () => (await chrome.declarativeNetRequest.getDynamicRules()).some(r=>r.condition.regexFilter?.includes("127"))', 'focus rules installed')
                target = context.new_page()
                url = f'http://127.0.0.1:{server.server_port}/watch?v=one&list=two'
                target.goto(url)
                target.wait_for_url(base + '/focus/blocked.html?url=**')
                expect(target.locator('#blocked-url')).to_contain_text('127.0.0.1')
                wait('async () => (await chrome.storage.local.get("blockedAttempts")).blockedAttempts.some(a=>a.url.includes("&list=two"))', 'blocked log preserves the entire query string')
                print('PASS: Focus UI start validation and actual DNR navigation block on explicit port/query', flush=True)

                options.get_by_role('button', name='More', exact=True).click()
                options.locator('#unlock-domain-input').fill('127.0.0.1')
                options.locator('#unlock-reason-input').fill('Synthetic test')
                options.locator('#unlock-trigger-btn').click()
                wait('async () => (await chrome.declarativeNetRequest.getDynamicRules()).some(r=>r.action.type==="allow")', 'unlock rule installed')
                target.goto(url)
                expect(target.locator('body')).to_have_text('Local focus fixture')
                worker.evaluate('''async () => { const {unlocks}=await chrome.storage.local.get('unlocks'); unlocks[0].timestamp=Date.now()-301000; await chrome.storage.local.set({unlocks}); await updateBlockingRules(); }''')
                target.goto(url)
                target.wait_for_url(base + '/focus/blocked.html?url=**')
                print('PASS: real emergency bypass and expired unlock re-blocking', flush=True)

                worker.evaluate('chrome.storage.local.set({focus:{active:false},blockRules:[],dailyLimits:[{id:"quota",raw:"127.0.0.1",host:"127.0.0.1",pathPrefix:"/",minutes:1,usedMs:60000}],unlocks:[]})')
                worker.evaluate('updateBlockingRules()')
                target.goto(url)
                target.wait_for_url(base + '/focus/blocked.html?url=**')
                print('PASS: exhausted daily quota blocks without active Focus', flush=True)

                worker.evaluate('''async () => {
                    await chrome.storage.local.set({dailyLimits:[],settings:{strictMode:false,enabledPresets:['reddit_research'],redditWhitelisted:['rust']}});
                    await updateBlockingRules();
                }''')
                outcomes = worker.evaluate('''async () => {
                    const results=[];
                    for (const url of ['https://www.reddit.com/r/rust/?sort=new','https://www.reddit.com/r/gaming/?sort=new','https://www.reddit.com/search?q=test'])
                        results.push(await chrome.declarativeNetRequest.testMatchOutcome({url,type:'main_frame'}));
                    return results;
                }''')
                rules = worker.evaluate('chrome.declarativeNetRequest.getDynamicRules()')
                actions = {r['id']: r['action']['type'] for r in rules}
                assert any(actions[m['ruleId']] == 'allow' for m in outcomes[0]['matchedRules'])
                for result in outcomes[1:]:
                    assert any(actions[m['ruleId']] == 'redirect' for m in result['matchedRules'])
                print('PASS: real Chrome DNR Reddit whitelist, blocked subreddit and search query', flush=True)

                worker.evaluate('''async () => {
                    await chrome.storage.local.set({settings:{strictMode:false,enabledPresets:[],redditWhitelisted:[]},focus:{active:true,task:'Alarm fixture',startedAt:Date.now(),endsAt:Date.now()+1000,durationMinutes:1/60,pendingLog:false}});
                }''')
                wait('async () => (await chrome.storage.local.get("focus")).focus.pendingLog === true', 'dedicated focus alarm must finish without waiting for periodic alarm')
                expect(focus.locator('#pending-log-container')).to_be_visible()
                focus.locator('#log-done-btn').click()
                wait('async () => (await chrome.storage.local.get("focusHistory")).focusHistory.some(r=>r.task==="Alarm fixture"&&r.result==="Done")', 'session history saved')
                print('PASS: real scheduled alarm completes Focus promptly and history persists', flush=True)

                options.get_by_role('button', name='More', exact=True).click()
                with options.expect_download() as download:
                    options.locator('#export-settings-btn').click()
                backup = Path(temp) / 'backup.json'
                download.value.save_as(backup)
                payload = json.loads(backup.read_text(encoding='utf-8'))
                assert payload['app'] == 'Focus Firewall' and payload['schemaVersion'] == 1
                payload['data']['blockRules'] = ['example.com/watch']
                backup.write_text(json.dumps(payload), encoding='utf-8')
                options.locator('#import-file-input').set_input_files(str(backup))
                expect(options.locator('#import-export-status')).to_have_class('success-text')
                wait('async () => (await chrome.storage.local.get("blockRules")).blockRules.some(r=>r.host==="example.com"&&r.pathPrefix==="/watch")', 'backup restored')
                bad = Path(temp) / 'bad.json'
                bad.write_text('{broken', encoding='utf-8')
                before = worker.evaluate('chrome.storage.local.get("blockRules")')
                options.locator('#import-file-input').set_input_files(str(bad))
                expect(options.locator('#import-export-status')).to_have_class('error-text')
                assert worker.evaluate('chrome.storage.local.get("blockRules")') == before
                invalid_shape = Path(temp) / 'wrong-shape.json'
                invalid_shape.write_text(json.dumps({'app':'Focus Firewall','schemaVersion':1,'data':{'settings':{'enabledPresets':'broken'},'blockRules':['should-not-be-saved.example']}}), encoding='utf-8')
                options.locator('#import-file-input').set_input_files(str(invalid_shape))
                expect(options.locator('#import-export-status')).to_have_class('error-text')
                assert worker.evaluate('chrome.storage.local.get("blockRules")') == before
                print('PASS: backup download/restore and malformed import leave settings intact', flush=True)

                options.get_by_role('button', name='Modes', exact=True).click()
                response = options.evaluate('chrome.runtime.sendMessage({type:"healthy-feed",action:"configure",mode:"information",maxPosts:20})')
                assert not response.get('error'), response
                facebook = context.new_page()
                facebook.goto('https://www.facebook.com/')
                expect(facebook.locator('[role="main"]')).to_be_hidden()
                started = options.evaluate('chrome.runtime.sendMessage({type:"healthy-feed",action:"start"})')
                assert started['session']['maxPosts'] == 20
                expect(facebook.locator('#ad')).to_have_attribute('data-ff-post', 'hidden')
                expect(facebook.locator('#reel')).to_have_count(0)
                expect(facebook.locator('#fun')).to_have_attribute('data-ff-post', 'hidden')
                expect(facebook.locator('#tech')).to_have_attribute('data-ff-post', 'visible')
                expect(facebook.get_by_role('navigation')).to_be_visible()
                wait('async () => (await chrome.storage.local.get("healthyFeedSession")).healthyFeedSession.ids.length === 1', 'visible post counted')
                facebook.reload()
                expect(facebook.locator('#tech')).to_have_attribute('data-ff-post', 'visible')
                assert len(worker.evaluate('chrome.storage.local.get("healthyFeedSession")')['healthyFeedSession']['ids']) == 1
                print('PASS: Healthy Feed gating, ad/Reel/low-signal filters, visible counting and reload deduplication', flush=True)

                worker.evaluate('''async () => {const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,strictMode:true}});}''')
                denied = options.evaluate('chrome.runtime.sendMessage({type:"healthy-feed",action:"configure",mode:"unrestricted",maxPosts:30})')
                assert denied.get('error')
                assert worker.evaluate('chrome.storage.local.get("settings")')['settings']['healthyFeed']['mode'] == 'information'
                worker.evaluate('''async () => {const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,strictMode:false}});}''')
                options.evaluate('chrome.runtime.sendMessage({type:"healthy-feed",action:"configure",mode:"unrestricted",maxPosts:20})')
                expect(facebook.locator('#ad')).to_be_visible()
                expect(facebook.locator('#fun')).to_be_visible()
                print('PASS: Strict Mode rejects filter relaxation; Unrestricted restores original feed', flush=True)
                assert not errors, '\n'.join(errors)
                print('PASS: no runtime errors in Focus/Healthy Feed', flush=True)
            finally:
                context.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
