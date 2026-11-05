"""Optional browser smoke test: python tests/browser_smoke.py (requires playwright + chromium)."""
import os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

base=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='motokare-ui-') as temp:
    env={**os.environ,'PORT':'30471','HOST':'127.0.0.1','PG_SCHEMA':'mk_smoke_'+__import__('secrets').token_hex(5)}
    proc=subprocess.Popen(['node','--env-file-if-exists=.env','backend/server.js'],cwd=base,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen('http://127.0.0.1:30471/api/health',timeout=1);break
            except Exception:time.sleep(.1)
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
            page=browser.new_page(viewport={'width':1380,'height':850})
            errors=[]
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:30471/',wait_until='domcontentloaded',timeout=15000)
            page.screenshot(path=str(Path(temp)/'home_screenshot.png'),full_page=False)
            page.locator('a[href="#/register"]').first.click()
            page.locator('input[name="fullName"]').fill('Test Rider')
            page.locator('input[name="email"]').fill('rider-ui@example.com')
            page.locator('input[name="password"]').fill('securePasswordForRider!')
            page.locator('form[data-form="register"] button[type="submit"]').click()
            page.wait_for_url('**/#/rider/dashboard',timeout=10000)
            page.locator('[data-action="add-bike"]').first.click()
            page.locator('#f-model').fill('Honda Click 125')
            page.locator('#f-year').fill('2025')
            page.locator('#f-plate').fill('AB123')
            page.locator('#f-odometer').fill('800')
            page.locator('form[data-form="add-bike"] button[type="submit"]').click()
            page.locator('h2').filter(has_text='Honda Click').first.wait_for(timeout=5000)
            page.locator('[data-action="update-mileage"]').first.click()
            page.locator('#f-odometer').fill('1500')
            page.locator('form[data-form="update-mileage"] button[type="submit"]').click()
            page.get_by_text('1,500',exact=False).first.wait_for(timeout=5000)
            page.reload(wait_until='domcontentloaded')
            page.wait_for_url('**/#/rider/dashboard',timeout=5000)
            page.get_by_text('Honda Click 125',exact=False).first.wait_for(timeout=5000)
            page.screenshot(path=str(Path(temp)/'rider_screenshot.png'),full_page=False)
            page.locator('[data-action="logout"]').click()
            page.wait_for_url('**/#/',timeout=5000)
            page.locator('a[href="#/register"]').first.click()
            page.locator('[data-action="auth-role"][data-role="shop"]').click()
            page.locator('input[name="fullName"]').fill('Test Shop')
            page.locator('input[name="email"]').fill('shop-ui@example.com')
            page.locator('input[name="password"]').fill('securePasswordForShop!')
            page.locator('input[name="shopName"]').fill('Bike Test Center')
            page.locator('form[data-form="register"] button[type="submit"]').click()
            page.wait_for_url('**/#/shop/dashboard',timeout=10000)
            page.locator('[data-action="add-customer"]').first.click()
            page.locator('#f-name').fill('Customer One')
            page.locator('#f-contact').fill('09123456789')
            page.locator('#f-motorcycle').fill('Yamaha Mio')
            page.locator('#f-odometer').fill('3450')
            page.locator('form[data-form="add-customer"] button[type="submit"]').click()
            page.locator('a[href="#/shop/customers"]').last.click()
            page.get_by_text('Customer One').first.wait_for(timeout=5000)
            page.screenshot(path=str(base/'tests/shop_screenshot.png'),full_page=False)
            if errors: raise AssertionError('Browser JS errors: '+str(errors))
            print('BROWSER_SMOKE_PASS: landing, rider register, CRUD, reload persistence, logout, shop register, customer CRUD')
            browser.close()
    finally:
        proc.terminate()
        try:proc.wait(timeout=3)
        except subprocess.TimeoutExpired:proc.kill()