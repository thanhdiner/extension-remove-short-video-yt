"""Verify on-demand injection, measurement and complete cleanup in real Chromium."""
from pathlib import Path
import json
from tempfile import TemporaryDirectory, gettempdir
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


def overlaps(a,b,gap=0):
    return a['x'] < b['x']+b['width']+gap-.01 and a['x']+a['width']+gap-.01 > b['x'] and a['y'] < b['y']+b['height']+gap-.01 and a['y']+a['height']+gap-.01 > b['y']


def valid_layout(rects,width,gap=0):
    return all(r['x'] >= 1 and r['y'] >= 1 and r['x']+r['width'] <= width-1+.01 and r['y']+r['height'] <= 799+.01 for r in rects) and not any(overlaps(a,b,gap) for i,a in enumerate(rects) for b in rects[i+1:])


def label_rects(page):
    return page.locator('.metric').evaluate_all('''els=>els.map(el=>{
        const r=el.getBoundingClientRect();return {text:el.textContent,x:r.x,y:r.y,width:r.width,height:r.height};
    })''')


def main():
    with TemporaryDirectory(prefix='dinkit-ruler-') as temp, sync_playwright() as p:
        context = p.chromium.launch_persistent_context(str(Path(temp) / 'profile'), channel='chromium', headless=True,
            viewport={'width': 1100, 'height': 800}, args=[f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}'])
        try:
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
            base = 'chrome-extension://' + worker.url.split('/')[2]
            context.route('https://ruler.test/**', lambda route: route.fulfill(content_type='text/html', body='''<!doctype html>
                <style>body{margin:0;height:3000px;background:#fafafa}#target{position:absolute;left:200px;top:200px;width:300px;height:160px;background:#aad}button{position:absolute;left:250px;top:250px}</style>
                <div id="target"></div><button onclick="document.body.dataset.clicked='yes'">Page button</button>'''))
            popup = context.new_page(); popup.goto(base + '/popup.html')
            expect(popup.get_by_role('button', name='Thước đo trang')).to_be_visible()
            page = context.new_page(); page.goto('https://ruler.test/')
            assert page.locator('#dinkit-page-ruler').count() == 0
            labels = {'title': 'Page Ruler', 'hint': 'Drag · Arrows · Esc', 'reset': 'Reset', 'grid': 'Grid', 'close': 'Close'}

            def toggle():
                page.bring_to_front()
                popup.evaluate('''async labels => {
                    const {openPageRuler} = await import('./src/page-ruler.mjs');
                    await openPageRuler(labels);
                }''', labels)

            # Exercise the real home-menu action; retain this test tab when it
            # requests popup closure so it can drive later toggle checks.
            popup.evaluate("window.close = () => { window.rulerClosedPopup = true; }")
            page.bring_to_front()
            popup.evaluate("[...document.querySelectorAll('button')].find(el => el.textContent === 'Thước đo trang').click()")
            expect(page.locator('#dinkit-page-ruler')).to_be_visible()
            popup.wait_for_function('window.rulerClosedPopup === true')
            page.mouse.move(200, 200); page.mouse.down(); page.mouse.move(500, 360, steps=8)
            batching = page.evaluate('''async () => {
                const root = document.querySelector('#dinkit-page-ruler').shadowRoot;
                const surface = root.querySelector('.surface'), box = root.querySelector('.box');
                const observer = new MutationObserver(() => {});
                observer.observe(box, {attributes:true, childList:true, subtree:true});
                const before = root.querySelector('.toolbar').getBoundingClientRect().width;
                for (let i=1; i<=250; i++) surface.dispatchEvent(new PointerEvent('pointermove', {
                    pointerId:1, isPrimary:true, clientX:500+i/1000, clientY:360.5, bubbles:true
                }));
                const immediate = observer.takeRecords().length;
                observer.disconnect();
                await new Promise(requestAnimationFrame);
                const rect = box.getBoundingClientRect();
                return {immediate, width:rect.width, height:rect.height,
                    toolbarStable:root.querySelector('.toolbar').getBoundingClientRect().width === before};
            }''')
            assert batching['immediate'] == 0, 'pointer bursts must wait for one animation frame'
            assert abs(batching['width'] - 300.25) < 0.05, batching
            assert abs(batching['height'] - 160.5) < 0.05, batching
            assert batching['toolbarStable'], 'metrics changes must not resize the toolbar'
            page.mouse.move(500, 360); page.mouse.up()
            expect(page.locator('.metric-w')).to_have_text('(w) 300px')
            expect(page.locator('.metric-h')).to_have_text('(h) 160px')
            # Coordinate labels surround the two corners, with dimensions along edges.
            assert page.locator('.metric-start-x').bounding_box()['x'] < 200
            assert page.locator('.metric-start-y').bounding_box()['y'] < 200
            assert page.locator('.metric-end-x').bounding_box()['x'] > 500
            assert page.locator('.metric-end-y').bounding_box()['y'] > 360
            assert page.locator('.toolbar').bounding_box()['width'] <= 130
            page.keyboard.press('ArrowRight'); page.keyboard.press('Shift+ArrowDown')
            expect(page.locator('.metric-w')).to_have_text('(w) 301px')
            expect(page.locator('.metric-h')).to_have_text('(h) 170px')
            assert page.locator('body').get_attribute('data-clicked') is None
            page.locator('summary').click()
            page.get_by_role('button', name='Lưới', exact=True).click()
            expect(page.get_by_role('button', name='Lưới', exact=True)).to_have_attribute('aria-pressed', 'false')
            page.get_by_role('button', name='Đo lại', exact=True).click()
            expect(page.locator('.box')).to_be_hidden()
            # Reverse drag and scrolling preserve document-relative geometry.
            page.mouse.move(500, 360); page.mouse.down(); page.mouse.move(200, 200); page.mouse.up()
            expect(page.locator('.metric-w')).to_have_text('(w) 300px')
            expect(page.locator('.metric-h')).to_have_text('(h) 160px')
            page.evaluate('window.scrollTo(0,100)')
            page.wait_for_function("document.querySelector('#dinkit-page-ruler').shadowRoot.querySelector('.box').getBoundingClientRect().top === 100")
            expect(page.locator('.metric-start-x')).to_have_text('(x) 200px')
            expect(page.locator('.metric-start-y')).to_have_text('(y) 200px')
            page.screenshot(path=str(Path(gettempdir()) / 'dinkit-ruler-preview.png'))
            page.evaluate('window.scrollTo(0,0)')
            page.wait_for_function('scrollY === 0')
            # User regression: 197x143 has room around its edges; do not turn it
            # into a centered 2x3 panel merely because it is narrower than 220px.
            page.mouse.move(450,212); page.mouse.down(); page.mouse.move(647,355); page.mouse.up()
            expect(page.locator('.metric-w')).to_have_text('(w) 197px')
            expect(page.locator('.metric-h')).to_have_text('(h) 143px')
            assert page.locator('.metric-start-x').bounding_box()['x'] < 450
            assert page.locator('.metric-start-y').bounding_box()['y'] < 212
            assert abs(page.locator('.metric-start-y').bounding_box()['x']-452) < 1
            label = page.locator('.metric-w').bounding_box()
            assert label['y']+label['height'] <= 212
            label = page.locator('.metric-h').bounding_box()
            assert label['x']+label['width'] <= 450
            assert page.locator('.metric-end-x').bounding_box()['x'] > 647
            assert page.locator('.metric-end-y').bounding_box()['y'] > 355
            page.screenshot(path=str(Path(gettempdir()) / 'dinkit-ruler-197x143-preview.png'))
            # Retain source reference values/dimensions; label placement now
            # intentionally prioritizes keeping the selection unobstructed.
            reference = json.loads((ROOT/'tests/fixtures/page-ruler-reference.json').read_text(encoding='utf-8'))
            for case in reference['cases']:
                page.set_viewport_size({'width':case['viewport'],'height':800})
                page.mouse.move(*case['start']); page.mouse.down(); page.mouse.move(*case['end']); page.mouse.up()
                actual = label_rects(page)
                assert valid_layout(actual,case['viewport']), (case,actual)
                for got,expected in zip(actual,case['labels']):
                    assert got['text'] == expected['text'], (case,got,expected)
                    for key in ['width','height']:
                        assert abs(got[key]-expected[key]) < .1, (case['viewport'],case['start'],case['end'],key,got,expected)
            page.set_viewport_size({'width':1100,'height':800})
            # Regression from the user's screenshot: W/H collide under the
            # original rules at 117x72, particularly near the top edge.
            for width,height in [(117,72),(113,65),(114,66),(120,70),(130,80),(150,90)]:
                for x,y in [(472,60),(472,150),(2,35),(970,700)]:
                    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+width,y+height);page.mouse.up()
                    expect(page.locator('.metric-w')).to_have_text(f'(w) {width}px')
                    expect(page.locator('.metric-h')).to_have_text(f'(h) {height}px')
                    assert valid_layout(label_rects(page),1100), (x,y,width,height,label_rects(page))
            page.mouse.move(472,60);page.mouse.down();page.mouse.move(589,132);page.mouse.up()
            page.screenshot(path=str(Path(gettempdir())/'dinkit-ruler-117x72-preview.png'))
            # Keep an edge-case screenshot for visual review.
            page.mouse.move(1080, 760); page.mouse.down(); page.mouse.move(1090, 770); page.mouse.up()
            expect(page.locator('.metric-w')).to_have_text('(w) 10px')
            page.screenshot(path=str(Path(gettempdir()) / 'dinkit-ruler-small-preview.png'))
            page.keyboard.press('Escape')
            expect(page.locator('#dinkit-page-ruler')).to_have_count(0)
            page.get_by_role('button', name='Page button').click()
            expect(page.locator('body')).to_have_attribute('data-clicked', 'yes')
            toggle(); toggle()
            expect(page.locator('#dinkit-page-ruler')).to_have_count(0)
            toggle(); page.locator('summary').click(); page.get_by_role('button', name='Close', exact=True).click()
            expect(page.locator('#dinkit-page-ruler')).to_have_count(0)
            toggle(); page.reload()
            expect(page.locator('#dinkit-page-ruler')).to_have_count(0)
            print(f"PASS: {len(reference['cases'])} reference values, outside dimension labels, 24 short-rectangle collision cases, frame batching and cleanup", flush=True)
        finally:
            context.close()


if __name__ == '__main__':
    main()
