"""Test actual content-script injection against controlled site fixtures."""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
YOUTUBE = '''<!doctype html><html><body style="margin:0"><div id="movie_player" class="html5-video-player" style="position:relative;height:200px"><video></video></div>
<ytd-reel-shelf-renderer id="shorts">Shorts shelf</ytd-reel-shelf-renderer>
<ytd-video-renderer id="regular"><a href="/watch?v=normal">Normal video</a></ytd-video-renderer>
<ytd-video-renderer id="short-result"><a href="/shorts/short1">Short video</a></ytd-video-renderer>
<input id="typing"><div id="editable" contenteditable="true">edit</div>
<div id="comments">Comments</div><div id="related">Related</div>
<button class="ytp-autonav-toggle-button" aria-checked="true" onclick="this.setAttribute('aria-checked','false')">Autoplay</button>
<yt-confirm-dialog-renderer><span id="title">Video paused. Continue watching?</span><button id="confirm-button" onclick="document.body.dataset.confirmed='yes'">Continue</button></yt-confirm-dialog-renderer>
<div style="height:3000px">Scroll fixture</div></body></html>'''
NOTEBOOK = '''<!doctype html><html><body>
<div id="video-wrapper" style="display:grid"><iframe src="https://www.youtube.com/embed/test"></iframe></div>
<div class="source-guide-container" style="display:flex">Source guide</div>
<div class="elements-container"><pre>console.log('DinKit');</pre></div>
<div id="ordinary">Ordinary notebook text</div></body></html>'''


def main():
    with TemporaryDirectory(prefix='dinkit-utilities-') as temp, sync_playwright() as p:
        context = p.chromium.launch_persistent_context(str(Path(temp) / 'profile'), channel='chromium', headless=True,
            args=[f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}'])
        errors = []
        context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(f'{page.url}: {error}')))
        context.route('https://www.youtube.com/**', lambda route: route.fulfill(content_type='text/html', body=YOUTUBE))
        context.route('https://music.youtube.com/**', lambda route: route.fulfill(content_type='text/html', body=YOUTUBE))
        context.route('https://notebooklm.google.com/**', lambda route: route.fulfill(content_type='text/html', body=NOTEBOOK))
        try:
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
            base = 'chrome-extension://' + worker.url.split('/')[2]
            popup = context.new_page()
            popup.goto(base + '/popup.html')
            def settings(patch):
                result = popup.evaluate('patch => chrome.runtime.sendMessage({type:"DINKIT_SETTINGS_UPDATE",patch})', patch)
                assert result['ok'], result
            settings({'enabled': True, 'customSeekEnabled': True, 'seekSeconds': 20, 'userSpeed': 1})
            youtube = context.new_page()
            youtube.goto('https://www.youtube.com/watch?v=fixture')
            expect(youtube.locator('#shorts')).to_be_hidden()
            expect(youtube.locator('#short-result')).to_be_hidden()
            expect(youtube.locator('#regular')).to_be_visible()
            youtube.evaluate('''() => { const v=document.querySelector('video'); Object.defineProperty(v,'duration',{value:120}); v.currentTime=40; }''')
            youtube.keyboard.press('=')
            youtube.wait_for_function('() => document.querySelector("video").playbackRate === 1.1')
            youtube.keyboard.press('-')
            youtube.wait_for_function('() => document.querySelector("video").playbackRate === 1')
            youtube.keyboard.press('ArrowRight')
            assert youtube.evaluate('document.querySelector("video").currentTime') == 60
            youtube.keyboard.press('ArrowLeft')
            assert youtube.evaluate('document.querySelector("video").currentTime') == 40
            youtube.locator('#typing').focus()
            youtube.keyboard.press('=')
            assert youtube.evaluate('document.querySelector("video").playbackRate') == 1
            youtube.locator('#typing').blur()
            settings({'userSpeed': 1.5})
            youtube.evaluate('document.querySelector("video").dispatchEvent(new Event("loadedmetadata", {bubbles:true}))')
            youtube.wait_for_function('() => document.querySelector("video").playbackRate === 1.5')
            print('PASS: Shorts filtering, normal results, speed, persistent speed, seek and typing exclusion', flush=True)

            settings({'enabled': False})
            expect(youtube.locator('#shorts')).to_be_visible()
            youtube.keyboard.press('=')
            assert youtube.evaluate('document.querySelector("video").playbackRate') == 1.5, 'disabled YouTube feature must not change video speed'
            youtube.keyboard.press('ArrowRight')
            assert youtube.evaluate('document.querySelector("video").currentTime') == 40, 'disabled YouTube feature must not seek'
            settings({'enabled': True, 'shortsRedirect': 'watch'})
            youtube.goto('https://www.youtube.com/shorts/abc123')
            youtube.wait_for_url('https://www.youtube.com/watch?v=abc123')
            settings({'shortsRedirect': 'block'})
            youtube.goto('https://www.youtube.com/shorts/abc123')
            youtube.wait_for_url('https://www.youtube.com/')
            youtube.locator('yt-confirm-dialog-renderer #title').evaluate("el => el.textContent = 'Unsubscribe from this channel?'")
            youtube.evaluate("document.dispatchEvent(new Event('yt-popup-opened'))")
            assert youtube.locator('body').get_attribute('data-confirmed') is None, 'unsubscribe dialog must not be confirmed automatically'
            youtube.locator('yt-confirm-dialog-renderer #title').evaluate("el => el.textContent = 'Video paused. Continue watching?'")
            youtube.evaluate("document.dispatchEvent(new Event('yt-popup-opened'))")
            expect(youtube.locator('body')).to_have_attribute('data-confirmed', 'yes')
            print('PASS: disabled controls, Watch/Home redirects and NonStop confirmation', flush=True)

            settings({'altScrollEnabled': True, 'scrollSpeed': 3, 'smoothScroll': False})
            youtube.evaluate('''() => { window.scrollTo(0,0); document.body.dispatchEvent(new WheelEvent('wheel',{deltaY:100,altKey:true,bubbles:true,cancelable:true})); }''')
            youtube.wait_for_function('() => window.scrollY === 300')
            settings({'altScrollEnabled': False})
            youtube.evaluate('''() => { document.body.dispatchEvent(new WheelEvent('wheel',{deltaY:100,altKey:true,bubbles:true,cancelable:true})); }''')
            assert youtube.evaluate('window.scrollY') == 300
            print('PASS: Alt+scroll multiplier, immediate scrolling and live disable', flush=True)

            awaitable = worker.evaluate('chrome.storage.local.get("settings")')
            worker.evaluate('settings => chrome.storage.local.set({settings:{...settings,enabledPresets:["youtube_learning"]}})', awaitable['settings'])
            youtube.goto('https://www.youtube.com/watch?v=learning')
            expect(youtube.locator('#comments')).to_be_hidden()
            expect(youtube.locator('#related')).to_be_hidden()
            youtube.evaluate('document.body.appendChild(document.createElement("div"))')
            expect(youtube.locator('.ytp-autonav-toggle-button')).to_have_attribute('aria-checked', 'false')
            youtube.goto('https://www.youtube.com/')
            youtube.wait_for_url('https://www.youtube.com/feed/subscriptions')
            worker.evaluate('chrome.storage.local.set({settings:{strictMode:false,enabledPresets:[],redditWhitelisted:[]}})')
            print('PASS: Learning preset hides comments/recommendations, disables autoplay and redirects Home', flush=True)
            music = context.new_page()
            music.goto('https://music.youtube.com/')
            music.evaluate("document.dispatchEvent(new Event('yt-popup-opened'))")
            expect(music.locator('body')).to_have_attribute('data-confirmed', 'yes')
            assert music.url == 'https://music.youtube.com/'
            music.close()
            print('PASS: NonStop is injected on YouTube Music and its Home is kept intact', flush=True)

            settings({'notebookEnabled': True})
            notebook = context.new_page()
            notebook.goto('https://notebooklm.google.com/notebook/fixture')
            expect(notebook.locator('#video-wrapper')).to_be_hidden()
            expect(notebook.locator('.source-guide-container')).to_be_hidden()
            expect(notebook.locator('#ordinary')).to_be_visible()
            context.grant_permissions(['clipboard-read','clipboard-write'], origin='https://notebooklm.google.com')
            notebook.locator('.copy-button').click()
            assert notebook.evaluate('navigator.clipboard.readText()') == "console.log('DinKit');"
            settings({'notebookEnabled': False})
            expect(notebook.locator('.copy-button')).to_have_count(0)
            expect(notebook.locator('#video-wrapper')).to_be_visible()
            expect(notebook.locator('.source-guide-container')).to_be_visible()
            assert notebook.locator('#video-wrapper').evaluate('el => el.style.display') == 'grid'
            assert notebook.locator('.source-guide-container').evaluate('el => el.style.display') == 'flex'
            settings({'notebookEnabled': True})
            expect(notebook.locator('.copy-button')).to_have_count(1)
            print('PASS: NotebookLM injected controls, exact clipboard, live disable/restore and re-enable', flush=True)
            assert not errors, '\n'.join(errors)
            print('PASS: no runtime errors in utility fixtures', flush=True)
        finally:
            context.close()


if __name__ == '__main__':
    main()
