"""Record label geometry from the author's public default Page Ruler renderer.

Run manually when updating the reference fixture; normal tests need no network.
Upstream code is used only in a temporary browser fixture, not shipped in DinKit.
"""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://raw.githubusercontent.com/leocompson/page-ruler/main/data/content_script/'


def main():
    cases = []
    for width in [1100, 356]:
        for start,end in [
            ((150,150),(347,293)), ((150,150),(450,310)),
            ((150,150),(170,293)), ((150,150),(347,160)),
            ((2,80),(199,223)), ((150,2),(347,145)),
            ((2,35),(199,178)), ((width-200,80),(width-3,223)),
            ((150,650),(347,793)), ((width-200,650),(width-3,793)),
            ((width-20,760),(width-10,770)), ((width-3,793),(width-200,650)),
            ((width-40,120),(width-3,500)), ((2,80),(width-3,793)),
        ]:
            cases.append({'viewport':width,'start':start,'end':end})
    cases.append({'viewport':1100,'start':(450,212),'end':(647,355)})
    with TemporaryDirectory(prefix='dinkit-reference-') as temp, sync_playwright() as p:
        downloaded = {}
        for name in ['inject.js','resources/render.js','inject.css']:
            dest = Path(temp)/Path(name).name
            with urlopen(BASE+name) as response: dest.write_bytes(response.read())
            downloaded[name] = dest
        browser = p.chromium.launch(channel='chromium', headless=True)
        try:
            page = browser.new_page()
            page.route('https://ruler.test/**',lambda route:route.fulfill(content_type='text/html',body='<!doctype html><style>body{margin:0;background:#fafafa}</style>'))
            page.goto('https://ruler.test/')
            page.evaluate('window.chrome = {runtime:{onMessage:{addListener(){}},sendMessage(){}}}')
            page.add_script_tag(path=str(downloaded['inject.js']))
            page.add_script_tag(path=str(downloaded['resources/render.js']))
            page.add_style_tag(path=str(downloaded['inject.css']))
            page.evaluate('config.ruler.show()')
            for case in cases:
                page.set_viewport_size({'width':case['viewport'],'height':800})
                page.mouse.move(*case['start']);page.mouse.down();page.mouse.move(*case['end']);page.mouse.up()
                case['labels'] = page.locator('.rulermode-rectangle > div').evaluate_all('''els => [1,0,2,3,4,5].map(i=>{
                    const el=els[i], r=el.getBoundingClientRect();return {text:el.textContent,x:r.x,y:r.y,width:r.width,height:r.height};
                })''')
                if case['start'] == (450,212):
                    page.screenshot(path=str(Path(temp).parent/'dinkit-ruler-reference-preview.png'))
            (ROOT/'tests/fixtures').mkdir(exist_ok=True)
            output = ROOT/'tests/fixtures/page-ruler-reference.json'
            output.write_text(json.dumps({'source':BASE,'mode':'grayscale','cases':cases},indent=2)+'\n',encoding='utf-8')
            print(f'Recorded {len(cases)} reference layouts: {output}')
        finally:
            browser.close()


if __name__ == '__main__':
    main()
