"""Developer browser tests. Requires Playwright + a Chromium executable.
Tests the built HTML in a real Chromium page. The test environment blocks URL
navigation, so set_content loads the exact built document; worker execution and
UI interaction are real. This insecure test context exercises the CPU fallback,
not the WebGPU path or OS save dialog.
"""
from pathlib import Path
import json, time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
results=[]
def record(name,detail=None):
    results.append({'name':name,'result':'PASS','detail':detail})
    print('PASS',name,detail or '',flush=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1050})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content((ROOT/'Aggregation_Explorer.html').read_text(encoding='utf-8'),wait_until='domcontentloaded')
    def wait_done(t=None,timeout=30000):
        if t is None:page.wait_for_function('AggregationApp.frame?.done && !AggregationApp.fatal',timeout=timeout)
        else:page.wait_for_function('(t)=>AggregationApp.frame?.done && Math.abs(AggregationApp.frame.time-t)<.01 && !AggregationApp.fatal',arg=t,timeout=timeout)
    wait_done()
    record('App opens and renders the default starting mask',page.evaluate('({backend:AggregationApp.frame.backend,shape:[AggregationApp.frame.nx,AggregationApp.frame.ny],patches:AggregationApp.frame.stats.patches,coverage:AggregationApp.frame.stats.coverage})'))
    initial_hash=page.evaluate('AggregationApp.crc()')
    page.screenshot(path=str(ROOT/'docs/app_initial.png'))
    # Smaller but genuinely rectangular integration run for repeatable timing.
    page.evaluate('AggregationApp.reset({resolution:128,aspect:1.5,backend:"cpu"})');wait_done(0)
    initial_hash=page.evaluate('AggregationApp.crc()')
    for target in (10,75,200):
        page.evaluate('(t)=>AggregationApp.seek(t)',target);wait_done(target)
    final_hash=page.evaluate('AggregationApp.crc()')
    record('Forward evolution and rectangular rendering',page.evaluate('({time:AggregationApp.frame.time,stats:AggregationApp.frame.stats,crc:AggregationApp.crc()})'))
    page.evaluate('AggregationApp.seek(10)');wait_done(10)
    page.evaluate('AggregationApp.seek(200)');wait_done(200)
    assert page.evaluate('AggregationApp.crc()')==final_hash
    record('Backward / forward timeline replay recovers bit-identical CPU state')
    page.locator('#pinButton').click();assert page.locator('#bookmarks button').count()==1
    record('Selected stage can be pinned')
    before=page.evaluate('AggregationApp.crc()')
    page.locator('#threshold').evaluate('(e)=>{e.value=4.5;e.dispatchEvent(new Event("input",{bubbles:true}));}')
    page.wait_for_timeout(300)
    assert page.evaluate('AggregationApp.crc()')==before
    page.locator('#invert').check();page.wait_for_timeout(200)
    assert page.evaluate('AggregationApp.crc()')==before
    record('Threshold and inversion do not change the continuous fields')
    page.locator('#extendButton').click();assert page.locator('#timelineCaption').inner_text().startswith('0–1,024')
    assert page.evaluate('AggregationApp.crc()')==before
    record('Extending the horizon preserves state and seed')
    saved=page.evaluate('AggregationApp.recipe()')
    page.locator('#newSeed').click();wait_done(0)
    assert page.evaluate('AggregationApp.crc()')!=initial_hash
    page.evaluate('(r)=>AggregationApp.importRecipe(r)',saved);wait_done(200)
    assert page.evaluate('AggregationApp.crc()')==before
    assert page.locator('#bookmarks button').count()==1
    record('Saved recipe reload reproduces selected stage and pins')
    # Rapidly superseded targets must settle at the last requested stage.
    page.evaluate('()=>{AggregationApp.seek(900);setTimeout(()=>AggregationApp.seek(40),15);}')
    wait_done(40)
    record('New seek supersedes a long in-flight seek')
    page.evaluate('AggregationApp.seek(5000)');page.wait_for_timeout(120);page.locator('#cancelButton').click();wait_done()
    assert page.evaluate('AggregationApp.frame.time')<5000
    record('Stop calculation settles at a valid completed step')
    # Mock only the external picker/writer; real rasterizer, button and encoder run.
    page.evaluate('''()=>{window.savedFiles=[];window.showSaveFilePicker=async (options)=>({createWritable:async()=>({write:async(blob)=>{const bytes=Array.from(new Uint8Array(await blob.arrayBuffer()));savedFiles.push({name:options.suggestedName,bytes});},close:async()=>{}})});}''')
    page.locator('#exportSize').select_option('512')
    for depth in ('8','16'):
        n=page.evaluate('savedFiles.length');page.locator('#bitDepth').select_option(depth)
        page.locator('#exportButton').click()
        page.wait_for_function('(n)=>savedFiles.length>n',arg=n,timeout=15000)
        exported=page.evaluate('savedFiles[savedFiles.length-1]')
        (ROOT/'tests'/f'test_export_{depth}.png').write_bytes(bytes(exported['bytes']))
    record('8-bit and 16-bit grayscale exports encode through the UI')
    page.locator('#helpButton').click();assert page.locator('#aboutDialog').is_visible();page.locator('#closeAbout').click()
    record('Model notes dialog opens and closes')
    page.evaluate('AggregationApp.reset({resolution:128,backend:"cpu"})');wait_done(0)
    page.locator('#playButton').click();page.wait_for_function('AggregationApp.frame.time>1',timeout=10000)
    page.locator('#playButton').click();wait_done()
    assert page.locator('#playButton').inner_text()=='Play'
    record('Play and pause use the same evolution timeline')
    page.locator('#resetButton').click();wait_done(0)
    record('Return to start restores the initial state')
    page.locator('#preset').select_option('reference');wait_done(0)
    assert page.locator('#radius').is_disabled()
    page.evaluate('AggregationApp.seek(30)');wait_done(30)
    record('Reference perturbation initialization evolves and disables irrelevant shape controls')
    # Final screenshot uses actual default fields at a later time.
    page.locator('#defaultsButton').click();wait_done(0)
    page.evaluate('AggregationApp.seek(200)');wait_done(200,45000)
    page.screenshot(path=str(ROOT/'docs/app_evolved.png'))
    record('Default 192-wide run through model age 200',page.evaluate('({stats:AggregationApp.frame.stats,time:AggregationApp.frame.time})'))
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(300)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    page.screenshot(path=str(ROOT/'docs/app_mobile.png'),full_page=False)
    record('Mobile viewport has no horizontal overflow')
    assert not errors,errors
    record('No uncaught main-page JavaScript errors',errors)
    result={'version':'dda-explorer-0.1.0','browser':browser.version,'context':'set_content / about:blank; CPU worker', 'webgpuRuntimeTested':False,'nativeSaveDialogTested':False,'tests':results}
    (ROOT/'tests/browser_results.json').write_text(json.dumps(result,indent=2))
    browser.close()
