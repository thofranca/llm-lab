"""Browser regression using the real GPU capture from validate_gpu.py.

Optional dependency: playwright; uses an installed Chrome (no browser download).
"""
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    root = Path(__file__).resolve().parent
    events = json.loads((root/'recordings/gpu-validation.json').read_text(encoding='utf-8'))['validation']['capture']
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(root/'app')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='chrome', headless=True)
            page = browser.new_page(viewport={'width':1280, 'height':900}, reduced_motion='reduce')
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('**/api/info', lambda route: route.fulfill(json={'model':'Qwen/Qwen3-0.6B'}))
            page.route('**/api/generate', lambda route: route.fulfill(content_type='application/x-ndjson', body='\n'.join(json.dumps(e) for e in events)+'\n'))
            page.goto(f'http://127.0.0.1:{server.server_port}/static/index.html')
            page.locator('#send').click()
            page.wait_for_function("capture.steps.length===8 && controller===null")
            page.locator('#viewLayers').click()
            assert page.locator('#comparison tr').count() == 96
            assert page.locator('#compareStep option').count() == 8
            page.locator('#pointLayer').select_option('27')
            page.locator('#pointGroup').select_option('15')
            assert '960–1023' in page.locator('#pointValue').inner_text()
            assert 'camada 27' in page.locator('#pointValue').inner_text()
            # Equal-step comparisons must have zero delta for every group.
            page.locator('#tab-compare').click()
            page.locator('#compareStep').select_option('7')
            assert page.locator('#comparison tr td:last-child').all_text_contents() == ['0']*96
            page.locator('#compareStep').select_option('0')
            assert 'Fora do contexto' in page.locator('#comparisonExtras').text_content()
            page.locator('#steps button').first.click()
            assert 'Passo 1' in page.locator('#pointValue').inner_text()
            assert page.locator('#pointLayer').input_value() == '27'
            assert not page.locator('#follow').is_checked()
            assert page.locator('#answer').inner_text() == next(e['text'] for e in reversed(events) if e['type']=='step')
            page.locator('#next').click()
            assert 'Passo 2' in page.locator('#stepLabel').inner_text()
            page.locator('#pinReference').click()
            assert page.locator('#compareStep').input_value() == '1'
            page.locator('#compareStep').select_option('0')
            page.locator('#network').scroll_into_view_if_needed()
            point = page.evaluate('scene.nodes[scene.nodes.length-1]')
            box = page.locator('#network').bounding_box()
            page.mouse.click(box['x']+point['x'], box['y']+point['y'])
            assert page.locator('#pointLayer').input_value() == str(point['layer'])
            assert page.locator('#pointGroup').input_value() == str(point['group'])
            page.locator('#steps button').last.click()
            page.locator('#tab-probability').click()
            page.screenshot(path=str(root/'recordings/ui-desktop.png'), full_page=True)
            with page.expect_download() as download:
                page.locator('#export').click()
            exported = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
            assert exported['format'] == 'llm-lab-v2'
            assert exported['steps'][0]['layers'][0]['groups'][0]['channel_end_exclusive'] == 64
            # Rerun must reset reference options, selections, rows and live follow.
            page.locator('#send').click()
            page.wait_for_function('controller===null && capture.steps.length===8')
            assert page.locator('#compareStep option').count() == 8
            assert page.locator('#compareStep').input_value() == '0'
            assert page.locator('#follow').is_checked()
            page.locator('#viewTokens').click()
            # Core panels must fit together without scrolling the page.
            for width,height in [(1280,720),(1366,768),(1920,1080),(390,844)]:
                page.set_viewport_size({'width':width, 'height':height})
                page.wait_for_timeout(150)
                for selector in ['#network','#answer','#steps']:
                    bounds=page.locator(selector).bounding_box()
                    assert bounds and bounds['y'] >= 0 and bounds['y']+bounds['height'] <= height, (width,height,selector,bounds)
                    assert bounds['height'] >= (90 if selector=='#network' else 25), (width,height,selector,bounds)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                assert page.evaluate('document.documentElement.scrollHeight <= innerHeight'), (width,height)
                active=page.locator('#steps button[aria-pressed=true]').bounding_box()
                strip=page.locator('#steps').bounding_box()
                assert active['x']>=strip['x']-1 and active['x']+active['width']<=strip['x']+strip['width']+1
                page.screenshot(path=str(root/f'recordings/dashboard-{width}.png'))
            page.locator('#tab-attention').click()
            assert page.locator('#panel-attention').is_visible()
            page.locator('#closeDetails').click()
            assert not page.locator('#panel-attention').is_visible()
            page.set_viewport_size({'width':390, 'height':844})
            page.screenshot(path=str(root/'recordings/ui-mobile.png'), full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.set_viewport_size({'width':1280,'height':720})
            page.locator('#settings summary').click()
            assert page.locator('#count').is_visible()
            page.keyboard.press('Escape')
            assert not page.locator('#count').is_visible()
            page.locator('#full').click()
            page.wait_for_function("document.fullscreenElement?.id === 'lab'")
            assert page.locator('#answer').is_visible() and page.locator('#steps').is_visible()
            page.locator('#full').click()
            # Replay the real events in two batches to check browsing during generation.
            page.evaluate("events=>{capture={meta:null,steps:[],done:null};selected=0;$('compareStep').replaceChildren();$('steps').replaceChildren();$('follow').checked=true;events.forEach(processEvent);}", events[:6])
            page.locator('#steps button').first.click()
            page.evaluate('events=>events.forEach(processEvent)', events[6:])
            assert page.locator('#timeline').input_value()=='0'
            assert page.locator('#answer').inner_text()==next(e['text'] for e in reversed(events) if e['type']=='step')
            assert not errors, errors
            browser.close()
            print('PASS: simultaneous 3D/answer/tokens at 4 viewport sizes; complete answer during replay; point picking, A/B, tabs, export and reset')
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
