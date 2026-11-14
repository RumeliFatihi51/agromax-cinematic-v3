import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
async function navigate(page: Page, name: string) {
  const menu=page.getByRole('button',{name:'Menüyü aç',exact:true});
  if(await menu.isVisible()) await menu.click();
  const target=page.locator('.studio-sidebar').getByRole('button',{name,exact:true,includeHidden:true});
  if(!(await target.isVisible())) {const group=target.locator('xpath=ancestor::details');if(await group.count())await group.locator('summary').click();}
  await target.click();
}
test('platform capabilities, persistent drafts, immutable versions and review-only exports are usable',async({page},info)=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?account=existing');await page.getByLabel('E-posta adresiniz').fill(`${info.project.name}@example.invalid`);await page.getByLabel('Şifreniz',{exact:true}).fill('browser-fixture-password-123');await page.getByRole('button',{name:'Platforma giriş yap'}).click();
  await expect(page.locator('.fw-overview-section')).toBeVisible();
  await navigate(page,'Platform merkezi');await expect(page.locator('.px-feature-card')).toHaveCount(14);
  await page.screenshot({path:`data/browser-results/${info.project.name}-platform-hub.png`,fullPage:true});
  for(const title of ['Çok kaynaklı uydu','Dijital ikiz','Arazi hafızası','Tarla zekâsı','Kanıt ve doğrulama','Tutarlılık kontrolü','Saha incelemeleri','Reçete planları','Dron bağlantıları','Ekonomik karşılaştırma','İzlenebilirlik ve MRV','Web ve mobil erişim']) {
    await navigate(page,title);await expect(page.locator('.px-workspace h1')).toHaveText(({ 'Dijital ikiz':'Tarlan için iki plan dene.', 'Ekonomik karşılaştırma':'Her kararın bir maliyeti var.', 'Web ve mobil erişim':'AgroMax her ekranda.' } as Record<string,string>)[title] || title);
    if(title!=='Web ve mobil erişim') await expect(page.locator('.px-context-bar')).toBeVisible();
    if(title==='Arazi hafızası')await expect(page.getByRole('region',{name:'Kaydedilmiş gözlem çizgisi'})).toBeVisible();
    else if(title!=='Web ve mobil erişim')await expect(page.locator('.px-field-strip')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`overflow ${title}`).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await navigate(page,'Senaryo laboratuvarı');await expect(page.locator('.px-records')).toBeVisible();
  await page.getByRole('button',{name:'Yeni senaryo',exact:true}).click();const dialog=page.getByRole('dialog');
  const name=`EXPLICIT PLATFORM SCENARIO ${info.project.name} ${info.retry}`;
  await dialog.getByLabel('Dosya adı',{exact:true}).fill(name);await dialog.getByLabel('Miktar · m³',{exact:true}).fill('10');await dialog.getByLabel('Birim fiyat · TRY/m³',{exact:true}).fill('2');await dialog.getByRole('group',{name:'İşçilik',exact:true}).getByLabel('Miktar · saat',{exact:true}).fill('1');await dialog.getByRole('group',{name:'İşçilik',exact:true}).getByLabel('Birim fiyat · TRY/saat',{exact:true}).fill('100');
  await expect(dialog.getByLabel('Tahmini toplam')).toContainText('120,00');
  const saved=page.waitForResponse(response=>response.url().endsWith('/api/platform/records')&&response.request().method()==='POST');await dialog.getByRole('button',{name:'Dosyayı kaydet'}).click();const response=await saved;expect(response.status()).toBe(201);const body=await response.json();expect(body.record.calculation.totalMinor).toBe(12000);expect(body.record.review.machineExecution).toBe(false);
  await expect(dialog).toHaveCount(0);let card=page.locator('.px-record-list article').filter({has:page.getByRole('heading',{name,exact:true})});await expect(card).toBeVisible();
  await page.reload();await expect(card).toBeVisible();await card.getByRole('button',{name:'Düzenle',exact:true}).click();await dialog.getByText('Gübre, ekipman ve diğer giderler',{exact:true}).click();await dialog.getByLabel('Diğer gider · TRY',{exact:true}).fill('5');await dialog.getByRole('button',{name:'Dosyayı kaydet'}).click();await expect(dialog).toHaveCount(0);await expect(card).toContainText('v2');
  await card.getByRole('button',{name:'İnceleme iste',exact:true}).click();await expect(card).toContainText('İnceleme istendi');await card.getByRole('button',{name:'Sürümler',exact:true}).click();await expect(page.locator('.px-revisions li')).toHaveCount(3);await page.getByRole('button',{name:'Sürümleri kapat'}).click();
  const downloaded=page.waitForEvent('download');await card.getByRole('button',{name:'İnceleme dosyası',exact:true}).click();const file=await downloaded;expect(file.suggestedFilename()).toContain('agromax-inceleme-');
  await file.saveAs(`data/browser-results/${info.project.name}-platform-review.json`);
  const exported=JSON.parse(await readFile(`data/browser-results/${info.project.name}-platform-review.json`,'utf8'));
  expect(exported.machineExecution).toBe(false);expect(exported.expertApproval).toBe('not_approved');expect(exported.record.calculation.totalMinor).toBe(12500);
  await card.getByRole('button',{name:'Kopyala',exact:true}).click();
  await expect(dialog.getByLabel('Dosya adı',{exact:true})).toHaveValue(name+' · Kopya');
  await expect(dialog.getByLabel('Diğer gider · TRY',{exact:true})).toHaveValue('5');
  await dialog.getByText('Gelir ve duyarlılık varsayımı',{exact:true}).click();
  await dialog.getByLabel('Varsayılan satış miktarı (kg)').fill('20');
  await dialog.getByLabel('Varsayılan satış fiyatı / kg').fill('20');
  await dialog.getByLabel('Gelir değişimi (%)').fill('10');
  await dialog.getByLabel('Miktar ve fiyat kaynağı').fill('Explicit test quotation');
  await dialog.getByRole('button',{name:'Dosyayı kaydet'}).click();
  await expect(dialog).toHaveCount(0);
  await navigate(page,'Ekonomik karşılaştırma');
  await expect(page.getByRole('rowheader',{name:name+' · Kopya',exact:true})).toBeVisible();
  await expect(page.getByText('Varsayımsal net etki',{exact:true})).toBeVisible();
  await page.screenshot({path:`data/browser-results/${info.project.name}-scenario.png`,fullPage:true});

  const draftCases: Array<{title:string;button:string;name:string;values:Record<string,string>}> = [
    {title:'Saha incelemeleri',button:'Yeni saha incelemesi',name:'EXPLICIT INVESTIGATION',values:{'Kontrol edilecek bölge':'Northern boundary','İstenen veri veya saha kontrolü':'Explicit field visit test'}},
    {title:'Reçete planları',button:'Yeni reçete taslağı',name:'EXPLICIT REVIEW PLAN',values:{'Uzman incelemesine sunulan oran':'5','Kapsam ve ihtiyaç bölgesi açıklaması':'Review only; no application'}},
    {title:'Dron bağlantıları',button:'Yeni cihaz profili',name:'EXPLICIT DEVICE PROFILE',values:{'Cihaz modeli':'ISOLATED TEST MODEL'}},
  ];
  for(const item of draftCases) {
    const draftName=`${item.name} ${info.retry}`;
    await navigate(page,item.title);await page.getByRole('button',{name:item.button,exact:true}).click();await dialog.getByLabel('Dosya adı',{exact:true}).fill(draftName);
    if(item.title==='Reçete planları') {
      await expect(dialog.getByLabel('Birim',{exact:true})).toHaveValue('m³/ha');
      await dialog.getByLabel('Uygulama türü',{exact:true}).selectOption('fertilization');
      await expect(dialog.getByLabel('Birim',{exact:true})).toHaveValue('kg/ha');
      await dialog.getByLabel('Uygulama türü',{exact:true}).selectOption('irrigation');
      await expect(dialog.getByLabel('Birim',{exact:true})).toHaveValue('m³/ha');
      await dialog.getByLabel('Uygulama türü',{exact:true}).selectOption('fertilization');
    }
    for(const [label,value] of Object.entries(item.values))await dialog.getByLabel(label,{exact:true}).fill(value);
    await dialog.getByRole('button',{name:'Dosyayı kaydet'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('heading',{name:draftName,exact:true})).toBeVisible();
  }
  await navigate(page,'Arazi hafızası');await page.getByRole('button',{name:'Yeni saha gözlemi',exact:true}).click();await dialog.getByLabel('Dosya adı',{exact:true}).fill('EXPLICIT FIELD OBSERVATION');await dialog.getByLabel('Gözlem tarihi',{exact:true}).fill('2026-11-01');await dialog.getByLabel('Saha gözlemi',{exact:true}).fill('Explicit isolated test note; no agronomic finding.');await dialog.getByRole('button',{name:'Dosyayı kaydet'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('heading',{name:'EXPLICIT FIELD OBSERVATION',exact:true})).toBeVisible();
  await navigate(page,'İzlenebilirlik ve MRV');const exportEvent=page.waitForEvent('download');await page.getByRole('button',{name:'JSON kanıt paketini indir'}).click();expect((await exportEvent).suggestedFilename()).toContain('agromax-kanit-');
  for(const width of [375,768,1024,1440]) {await page.setViewportSize({width,height:950});await page.goto('/#platform');await expect(page.locator('.px-feature-card')).toHaveCount(14);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`hub at ${width}`).toBe(true);}
  expect(errors).toEqual([]);
});
