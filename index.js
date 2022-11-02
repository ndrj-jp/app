const functions = require('@google-cloud/functions-framework');
const puppeteer = require('puppeteer');
const nodemailer = require("nodemailer");
functions.cloudEvent('app', cloudEvent => {
(async() => {
    let total = 0
    let items = []
    const MAIL = process.env.MAIL;
    const PASSWORD = process.env.AMAZONPASSWORD;
    const browser = await puppeteer.launch({ 
        headless: true,
        args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
    ]});
    const page = await browser.newPage();
    // ログイン
    await page.goto('https://www.amazon.co.jp/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon.co.jp%2Fs%3Fk%3Damazon%2Blogin%26adgrpid%3D52807017749%26gclid%3DCj0KCQjwxIOXBhCrARIsAL1QFCZCgPqTg18LE_Hxd_z4F4NEW1N7IxRdq1TcTB10gozKCFfTIZCIYwIaAs_7EALw_wcB%26hvadid%3D612497663241%26hvdev%3Dc%26hvlocphy%3D1009453%26hvnetw%3Dg%26hvqmt%3De%26hvrand%3D10167128345550085766%26hvtargid%3Dkwd-360364907677%26hydadcr%3D27487_14591452%26jp-ad-ap%3D0%26tag%3Dgooghydr-22%26ref%3Dnav_signin&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=jpflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&');
    await page.type('input[name="email"]', MAIL);
    await page.click('input[type="submit"]');
    await page.waitForNavigation();
    await page.type('input[name="password"]', PASSWORD);
    await page.click('input[type="submit"]');
    await page.waitForNavigation();

    // 全体取得年数取得
    await page.goto('https://www.amazon.co.jp/gp/css/order-history?ref_=nav_orders_first', { waitUntil: 'domcontentloaded' });
    let startIndexs = await page.evaluate(() => {
        let lastIndex = 0
        if(!!document.querySelectorAll('.a-pagination>.a-normal>a').length) {
            const indexsElement = Array.from(document.querySelectorAll('.a-pagination>.a-normal>a'));
            return lastIndex = indexsElement[indexsElement.length-1].innerText;
        }
        return lastIndex
    })
    // 全体
    // 全ページ数取得
    for (let j = 0; startIndexs > j; j++) {

        await page.goto('https://www.amazon.co.jp/your-orders/orders?_encoding=UTF8&startIndex='+ 10*j + '&ref_=ppx_yo2ov_dt_b_pagination_1_'+ (1+j), {"waitUntil":"domcontentloaded"})
        // ページの高さ取得
        const bodyHandle = await page.$('body');
        const { height } = await bodyHandle.boundingBox();
        await bodyHandle.dispose();
        // ページ一番下へスクロール(lazyload対策)
        const viewportHeight = page.viewport().height;
        let viewportIncr = 0;
        while (viewportIncr + viewportHeight < height) {
            await page.evaluate(_viewportHeight => {
            window.scrollBy(0, _viewportHeight);
            }, viewportHeight);
            await page.waitForTimeout(20);
            viewportIncr = viewportIncr + viewportHeight;
        }
        // 1ページデータ単位
        const [gettotal, getitems] = await page.evaluate(() => {
            let total = 0
            let items = []
            const list = Array.from(document.querySelectorAll('.a-box-group'));
            // 1注文データ単位
            for (let x = 0; list.length > x; x++) {
                const itemdata = list[x].querySelectorAll('.a-fixed-left-grid-inner');
                const itemdate = list[x].querySelectorAll('.a-span3 .a-color-secondary')[1].innerText
                if(itemdate.replace(/(.+)年(.+)月(.+)日/g,'$2') == new Date().getMonth()) {
                    for (let y = 0; itemdata.length > y; y++) {
                        let item = {
                            itemName: itemdata[y].querySelectorAll('.a-col-right .a-link-normal')[0].innerText,
                            itemImg: itemdata[y].querySelectorAll('.a-col-left .a-link-normal>img')[0].src,
                            itemLink: itemdata[y].querySelectorAll('.a-col-right .a-link-normal')[0].href
                        }
                        items.push(item)
                    }
                    if(!!list[x].querySelectorAll('.a-span2 .a-color-secondary.value').length) {
                        total += Number(list[x].querySelectorAll('.a-span2 .a-color-secondary.value')[0].innerText.replace(/￥|,|\s/g,''))
                    } else {
                        total += Number(list[x].querySelectorAll('.yohtmlc-order-total')[0].innerText.replace(/￥|,|\s/g,''))
                    }
                    
                }
            }
            return [total,items]
        })
        total += gettotal
        if(getitems.length) {
            items.push(...getitems)
        }
    }

    await page.goto('https://www.amazon.co.jp/gp/flex/sign-out.html?path=%2Fgp%2Fyourstore%2Fhome&signIn=1&useRedirectOnSuccess=1&action=sign-out&ref_=nav_AccountFlyout_signout')
    await browser.close();
    // メール送信
    send(total,items);
    return 0
})()

const send = function(total, items) {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 465,
      secure: true,
      auth: {
        user: process.env.MAIL,
        pass: process.env.MAILPASS,
      },
    });
    let date = new Date()
    let itemhtml = '';
    items.forEach(item => {
      itemhtml += `<div style="width: 500px;border: solid 1px;border-radius: 3px;margin-bottom: 10px;padding: 10px">`
      itemhtml += `<img style="display: block;width: 150px;margin: auto;" src="${item.itemImg}">`
      itemhtml += `<a style="display: block;min-width: 200px;max-width: 500px;" href="${item.itemLink}">${item.itemName}</a>`
      itemhtml += `</div>`
    });
    transporter.sendMail({
      from: '19961005ndrj.private@gmail.com',
      to: '19961005ndrj.private@gmail.com',
      subject: `${date.getFullYear()}年${(date.getMonth())}月 amazon購入履歴`,
      html: `
              <div>
              <p style="font-weight: bold;">${date.getFullYear()}年${(date.getMonth())}月 合計支払い金額：${total}円</p>
              <p style="font-weight: bold;">購入一覧</p>
              </div>
              <div style="width: 100vw;">
              ${itemhtml}
              </div>
            `
    }, function (error, info) {
      if (error) {
        console.error(error);
      } else {
        console.log(`Email sent: ${info.response}`);
      }
    });
  }
})