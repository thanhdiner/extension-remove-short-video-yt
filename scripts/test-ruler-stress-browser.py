"""Exercise label geometry through the real extension, including drag frames.

Static sweeps use synthetic pointer events on an active mouse pointer to cover
many boundary combinations; motion/zoom/touch checks use actual browser input.
"""
from pathlib import Path
from tempfile import TemporaryDirectory, gettempdir
import json
import math
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(gettempdir())/'dinkit-ruler-stress'
ARTIFACTS.mkdir(exist_ok=True)

SWEEP = r'''async ({samples,seed,scroll}) => {
    const host=document.querySelector('#dinkit-page-ruler'), root=host.shadowRoot;
    const surface=root.querySelector('.surface'), labels=[...root.querySelectorAll('.metric')];
    const failures=[], durations=[]; let count=0, state=seed;
    const badge=root.querySelector('summary').getBoundingClientRect();
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const event=(type,p)=>surface.dispatchEvent(new PointerEvent(type,{pointerId:1,isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:p[0],clientY:p[1],bubbles:true}));
    const snapshot=()=>labels.map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent,x:r.x,y:r.y,w:r.width,h:r.height,clipped:el.scrollWidth>el.clientWidth};});
    const check=(a,b)=>{
        count++; const t=performance.now();event('pointerdown',a);event('pointermove',b);event('pointerup',b);durations.push(performance.now()-t);
        const rects=snapshot(), x=Math.min(a[0],b[0])+scrollX,y=Math.min(a[1],b[1])+scrollY,w=Math.abs(a[0]-b[0]),h=Math.abs(a[1]-b[1]);
        const expected=[x,y,w,h,x+w,y+h].map((v,i)=>`(${['x','y','w','h','x','y'][i]}) ${Math.round(v)}px`);
        const left=Math.min(a[0],b[0]),top=Math.min(a[1],b[1]),right=left+w,bottom=top+h;
        const lw=rects[0].w,lh=rects[0].h;
        const roomOutside=left>=lw+3&&top>=lh*3+6&&right<=innerWidth-lw-3&&bottom<=innerHeight-lh*3-6;
        const problems=[];
        rects.forEach((r,i)=>{
            if(r.text!==expected[i])problems.push(`value:${i}`);
            if(r.x<-.1||r.y<-.1||r.x+r.w>innerWidth+.1||r.y+r.h>innerHeight+.1)problems.push(`bounds:${i}`);
            if(r.clipped)problems.push(`text-clipped:${i}`);
            if(roomOutside&&Math.min(r.x+r.w,right)-Math.max(r.x,left)>.1&&Math.min(r.y+r.h,bottom)-Math.max(r.y,top)>.1)problems.push(`covers-selection:${i}`);
            if(Math.min(r.x+r.w,badge.right)-Math.max(r.x,badge.left)>.1&&Math.min(r.y+r.h,badge.bottom)-Math.max(r.y,badge.top)>.1)problems.push(`covered-by-status:${i}`);
            for(let j=0;j<i;j++) { const s=rects[j];if(Math.min(r.x+r.w,s.x+s.w)-Math.max(r.x,s.x)>.1&&Math.min(r.y+r.h,s.y+s.h)-Math.max(r.y,s.y)>.1)problems.push(`overlap:${j},${i}`); }
        });
        if(problems.length&&failures.length<12)failures.push({a,b,problems,rects,viewport:[innerWidth,innerHeight],scroll:[scrollX,scrollY]});
    };
    const dims=[0,1,2,31,32,33,34,35,63,64,65,66,67,68,70,71,72,73,95,96,97,98,100,110,111,112,113,114,116,117,118,189,190,191,197,219,220,221,222,223,224,300];
    const starts=[[476,264],[472,60],[450,212],[1,35],[innerWidth-2,35],[1,innerHeight-2],[innerWidth-2,innerHeight-2],[113,67],[114,68],[innerWidth/2,innerHeight/2]];
    // All sizes surrounding the arithmetic/layout thresholds, from every edge.
    for(const start of starts)for(const w of dims)for(const h of dims){
        const a=[Math.min(innerWidth-1,Math.max(1,start[0])),Math.min(innerHeight-1,Math.max(1,start[1]))];
        const b=[Math.min(innerWidth-1,Math.max(1,a[0]+(a[0]>innerWidth/2?-w:w))),Math.min(innerHeight-1,Math.max(1,a[1]+(a[1]>innerHeight/2?-h:h)))];
        check(a,b);if(failures.length>=12)return {count,failures};
    }
    for(let i=0;i<samples;i++){
        const a=[1+random()*(innerWidth-2),35+random()*Math.max(1,innerHeight-36)];
        const b=[1+random()*(innerWidth-2),1+random()*(innerHeight-2)];check(a,b);
        if(failures.length>=12)break;
    }
    durations.sort((a,b)=>a-b);
    return {count,failures,p95:durations[Math.floor(durations.length*.95)],max:durations.at(-1)};
}'''


def rects(page):
    return page.locator('.metric').evaluate_all('''els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,text:el.textContent,clipped:el.scrollWidth>el.clientWidth};})''')


def assert_rects(page,where,outside=False):
    items=rects(page);vw,vh=page.evaluate('[innerWidth,innerHeight]')
    badge=page.locator('summary').bounding_box()
    selection=page.locator('.box').bounding_box()
    for i,a in enumerate(items):
        assert not a['clipped'],(where,'text',i,items)
        if outside:
            assert min(a['x']+a['w'],selection['x']+selection['width'])-max(a['x'],selection['x'])<=.1 or min(a['y']+a['h'],selection['y']+selection['height'])-max(a['y'],selection['y'])<=.1,(where,'covers-selection',i,items)
        assert a['x']>=-.1 and a['y']>=-.1 and a['x']+a['w']<=vw+.1 and a['y']+a['h']<=vh+.1,(where,'bounds',i,items)
        assert min(a['x']+a['w'],badge['x']+badge['width'])-max(a['x'],badge['x'])<=.1 or min(a['y']+a['h'],badge['y']+badge['height'])-max(a['y'],badge['y'])<=.1,(where,'status-overlap',items)
        for b in items[:i]:
            assert min(a['x']+a['w'],b['x']+b['w'])-max(a['x'],b['x'])<=.1 or min(a['y']+a['h'],b['y']+b['h'])-max(a['y'],b['y'])<=.1,(where,'overlap',items)


def main():
    started=time.monotonic();report={'sweeps':[],'motion_frames':0,'screenshots':[],'zoom_factors':[]}
    with TemporaryDirectory(prefix='dinkit-ruler-stress-') as temp,sync_playwright() as p:
        context=p.chromium.launch_persistent_context(str(Path(temp)/'profile'),channel='chromium',headless=True,has_touch=True,
            viewport={'width':1100,'height':800},args=[f'--disable-extensions-except={ROOT}',f'--load-extension={ROOT}'])
        try:
            worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
            base='chrome-extension://'+worker.url.split('/')[2]
            errors=[]
            context.on('weberror',lambda error:errors.append(str(error.error)))
            context.route('https://ruler.test/**',lambda route:route.fulfill(content_type='text/html',body='''<!doctype html><meta charset="utf-8"><style>
                body{margin:0;height:2000000px;width:6000px;background:#232323;color:#ddd;font:16px Arial}
                .sample{position:absolute;top:250px;left:450px;width:400px;line-height:28px}
                </style><div class="sample">Nguồn: NICE +3<br>3. Áp dụng riêng cho mình<br>Ví dụ nội dung bên dưới vùng đo<br>Kiểm tra thước trong khi kéo</div>'''))
            popup=context.new_page();popup.goto(base+'/popup.html')
            page=context.new_page();page.goto('https://ruler.test/')
            def toggle():
                page.bring_to_front()
                popup.evaluate('''async()=>{const {openPageRuler}=await import('./src/page-ruler.mjs');await openPageRuler({title:'Page Ruler',mode:'Ruler mode…',hint:'Drag · Arrows · Esc',reset:'Reset',grid:'Grid',close:'Close'});}''')
            toggle()
            page.set_viewport_size({'width':1920,'height':1080})
            for start,end in [((706,278),(1217,608)),((1217,608),(706,278))]:
                page.mouse.move(*start);page.mouse.down();page.mouse.move(*end,steps=16);page.mouse.up()
                assert_rects(page,'511x330',outside=True)
                assert page.locator('.metric-w').inner_text()=='(w) 511px'
                assert page.locator('.metric-h').inner_text()=='(h) 330px'
            path=ARTIFACTS/'511x330-outside.png';page.screenshot(path=str(path));report['screenshots'].append(str(path))
            page.set_viewport_size({'width':1100,'height':800})
            for name,start,end in [('190x72',(476,264),(666,336)),('117x72',(472,60),(589,132)),('197x143',(450,212),(647,355)),('top-left',(1,35),(10,45))]:
                page.mouse.move(*start);page.mouse.down();page.mouse.move(*end,steps=12);page.mouse.up()
                assert_rects(page,name)
                path=ARTIFACTS/f'{name}.png';page.screenshot(path=str(path));report['screenshots'].append(str(path))
            print('PASS: exact screenshot regressions on a dark text fixture',flush=True)
            for viewport,scroll in [((1100,800),(0,0)),((356,600),(0,0)),((1920,1080),(0,0)),((320,240),(0,0)),((240,160),(0,0)),((178,300),(0,0)),((1100,800),(0,20000)),((1100,800),(3000,20000)),((1100,800),(0,1000000)),((240,160),(0,1000000)),((178,300),(0,1000000))]:
                page.set_viewport_size({'width':viewport[0],'height':viewport[1]})
                page.evaluate('p=>scrollTo(...p)',scroll)
                page.wait_for_timeout(30)
                page.mouse.move(150,120);page.mouse.down()
                result=page.evaluate(SWEEP,{'samples':1000,'seed':20261111,'scroll':scroll})
                page.mouse.up()
                result['viewport']=viewport;result['scroll']=scroll;report['sweeps'].append(result)
                print(f"SWEEP {viewport} scroll={scroll}: {result['count']} cases; failures={len(result['failures'])}",flush=True)
                if result['failures']:
                    failure=result['failures'][0]
                    page.mouse.move(*failure['a']);page.mouse.down();page.mouse.move(*failure['b']);page.mouse.up()
                    page.screenshot(path=str(ARTIFACTS/'failure.png'))
                    raise AssertionError(json.dumps(failure))
            # Capture final repaired layouts at the constraints that found bugs.
            for name,viewport,scroll in [('small-viewport',(240,160),(0,0)),('long-coordinates',(1100,800),(0,1000000)),('small-and-long',(240,160),(0,1000000))]:
                page.set_viewport_size({'width':viewport[0],'height':viewport[1]});page.evaluate('p=>scrollTo(...p)',scroll)
                page.evaluate('()=>new Promise(requestAnimationFrame)')
                page.mouse.move(20,60);page.mouse.down();page.mouse.move(min(viewport[0]-20,210),132);page.mouse.up();assert_rects(page,name)
                path=ARTIFACTS/f'{name}.png';page.screenshot(path=str(path));report['screenshots'].append(str(path))
            # Real mouse input: check every sampled rendered frame, before up.
            page.set_viewport_size({'width':1100,'height':800});page.evaluate('scrollTo(0,0)')
            for start in [(476,264),(2,35),(1097,797)]:
                page.mouse.move(*start);page.mouse.down()
                for i in range(140):
                    endpoint=(min(1098,max(1,start[0]+math.sin(i/15)*240)),min(798,max(1,start[1]+math.cos(i/11)*150)))
                    page.mouse.move(*endpoint)
                    page.evaluate('()=>new Promise(requestAnimationFrame)')
                    assert_rects(page,('motion',start,i));report['motion_frames']+=1
                page.mouse.up()
            print(f"PASS: {report['motion_frames']} real mouse drag frames",flush=True)
            # Exercise browser zoom; assertions use CSS viewport coordinates.
            for zoom in [.67,.8,1,1.25,1.5,2]:
                page.bring_to_front()
                popup.evaluate('''async zoom=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.tabs.setZoom(tab.id,zoom);}''',zoom)
                vw,vh=page.evaluate('[innerWidth,innerHeight]')
                page.mouse.move(vw*.4,vh*.4);page.mouse.down();page.mouse.move(vw*.6,vh*.55,steps=8);page.mouse.up();assert_rects(page,('zoom',zoom))
                report['zoom_factors'].append(zoom)
            page.bring_to_front()
            popup.evaluate('''async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.tabs.setZoom(tab.id,1);}''')
            # Touch follows the same pointer path, with actual CDP touch events.
            cdp=context.new_cdp_session(page)
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':476,'y':264}]})
            cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':666,'y':336}]})
            cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            assert_rects(page,'touch')
            assert page.locator('.metric-w').inner_text()=='(w) 190px'
            # Resize a stationary ruler without allowing labels outside viewport.
            for size in [(356,600),(320,240),(1100,800)]:
                page.set_viewport_size({'width':size[0],'height':size[1]});page.evaluate('()=>new Promise(requestAnimationFrame)');assert_rects(page,('resize',size))
            page.keyboard.press('Escape');assert page.locator('#dinkit-page-ruler').count()==0
            assert not errors,errors
            report['seconds']=round(time.monotonic()-started,2);report['passed']=True
            print(f"PASS: zoom, touch, resize, cleanup; {sum(r['count'] for r in report['sweeps'])} static cases in {report['seconds']}s",flush=True)
        finally:
            (ARTIFACTS/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            context.close()


if __name__=='__main__':main()
