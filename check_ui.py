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
            assert page.locator('#comparison tr').count() == 96
            assert page.locator('#compareStep option').count() == 8
            page.locator('#pointLayer').select_option('27')
            page.locator('#pointGroup').select_option('15')
            assert '960–1023' in page.locator('#pointValue').inner_text()
            assert 'camada 27' in page.locator('#pointValue').inner_text()
            # Equal-step comparisons must have zero delta for every group.
            page.locator('#compareStep').select_option('7')
            assert page.locator('#comparison tr td:last-child').all_text_contents() == ['0']*96
            page.locator('#compareStep').select_option('0')
            assert 'Fora do contexto' in page.locator('#comparisonExtras').text_content()
            page.locator('#steps button').first.click()
            assert 'Passo 1' in page.locator('#pointValue').inner_text()
            assert page.locator('#pointLayer').input_value() == '27'
            assert not page.locator('#follow').is_checked()
            page.locator('#network').scroll_into_view_if_needed()
            point = page.evaluate('scene.nodes[scene.nodes.length-1]')
            box = page.locator('#network').bounding_box()
            page.mouse.click(box['x']+point['x'], box['y']+point['y'])
            assert page.locator('#pointLayer').input_value() == str(point['layer'])
            assert page.locator('#pointGroup').input_value() == str(point['group'])
            page.locator('#steps button').last.click()
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
            page.set_viewport_size({'width':390, 'height':844})
            page.screenshot(path=str(root/'recordings/ui-mobile.png'), full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert not errors, errors
            browser.close()
            print('PASS: desktop/mobile, point picking, exact groups, A/B, export and reset; real GPU fixture')
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
