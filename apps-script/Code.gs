/** 1-QADAM: shu funksiyani ishga tushiring (Выполнить). Ruxsat so'raydi, jadvalni kerak bo'lsa sozlaydi, botni tekshiradi. Ma'lumotlarni o'chirmaydi. */
function ruxsatVaSozlash() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
  var header = sh ? sh.getRange(1, 1, 1, 13).getValues()[0] : [];
  if (!sh || header[9] !== 'xizmat') { setupSheets(); } else { Logger.log('Jadvallar joyida, tegilmadi.'); }
  ScriptApp.getProjectTriggers();
  var me = tg_('getMe', {});
  Logger.log(me.ok ? 'Bot ulandi: @' + me.result.username : 'Bot tokenida xato: ' + JSON.stringify(me));
}

/**
 * Sartarosh Bot — Google Apps Script backend (v2)
 *
 * Bitta Web App ikki ishni bajaradi:
 *   1) Telegram webhook (doPost, update_id bor)
 *   2) Sayt uchun API: bo'sh vaqtlar (doGet) va yozilish (doPost, action=book)
 *
 * Script Properties (Loyiha sozlamalari → Свойства скрипта):
 *   BOT_TOKEN          — @BotFather tokeni (majburiy)
 *   ADMIN_CODE         — sartarosh o'zini admin qilishi uchun maxfiy so'z: botga "/admin <ADMIN_CODE>"
 *   ADMIN_TELEGRAM_ID  — avtomatik yoziladi (/admin buyrug'idan keyin)
 *   WEBAPP_URL         — deploy qilingan .../exec manzili (setupBot uchun)
 */

var TZ = 'Asia/Tashkent';
var SITE_URL = 'https://nurali1986.github.io/sartarosh/';
var SHEET_BOOKINGS = 'Bookings';
var SHEET_CLIENTS = 'Clients';
var SHEET_SCHEDULE = 'Schedule';
var SHEET_BLOCKED = 'Blocked';

// Saytdagi js/main.js dagi SERVICES bilan bir xil tartibda bo'lishi kerak
var SERVICES = [
  { name: 'Soch turmagi', time: 45, price: 120000 },
  { name: 'Fade', time: 50, price: 140000 },
  { name: 'Soqol dizayni', time: 30, price: 80000 },
  { name: 'Klassik soqol olish', time: 40, price: 100000 },
  { name: 'Kompleks', time: 80, price: 200000 },
  { name: 'Bolalar (12 yoshgacha)', time: 30, price: 80000 }
];

// Bookings ustunlari (1-dan boshlab)
var C = { ID: 1, TG: 2, NAME: 3, PHONE: 4, DATE: 5, TIME: 6, STATUS: 7, REMIND: 8, CREATED: 9, SVC: 10, DUR: 11, NOTE: 12, SOURCE: 13 };

function getProp(key) { return PropertiesService.getScriptProperties().getProperty(key); }
function setProp(key, v) { PropertiesService.getScriptProperties().setProperty(key, String(v)); }
function BOT_TOKEN() { return getProp('BOT_TOKEN'); }
function ADMIN_ID() { return getProp('ADMIN_TELEGRAM_ID'); }
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) { return ss().getSheetByName(name); }

/* ===================== SETUP (qo'lda bir marta ishga tushiriladi) ===================== */

function setupSheets() {
  var spreadsheet = ss();
  function ensureSheet(name, headers) {
    var sh = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
    sh.clear();
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  ensureSheet(SHEET_BOOKINGS, ['booking_id', 'telegram_id', 'ism', 'telefon', 'sana', 'vaqt', 'status', 'reminder_sent', 'yaratilgan_vaqt', 'xizmat', 'davomiylik_min', 'izoh', 'manba']);
  ensureSheet(SHEET_CLIENTS, ['telegram_id', 'ism', 'telefon', 'username', 'royxatdan_otgan']);
  var sched = ensureSheet(SHEET_SCHEDULE, ['kun_raqami', 'kun_nomi', 'boshlanish', 'tugash', 'qadam_min', 'ish_kunimi']);
  sched.getRange(2, 1, 7, 6).setValues([
    ['0', 'Yakshanba', '10:00', '16:00', '30', 'FALSE'],
    ['1', 'Dushanba', '10:00', '21:00', '30', 'TRUE'],
    ['2', 'Seshanba', '10:00', '21:00', '30', 'TRUE'],
    ['3', 'Chorshanba', '10:00', '21:00', '30', 'TRUE'],
    ['4', 'Payshanba', '10:00', '21:00', '30', 'TRUE'],
    ['5', 'Juma', '14:00', '21:00', '30', 'TRUE'],
    ['6', 'Shanba', '09:00', '20:00', '30', 'TRUE']
  ]);
  ensureSheet(SHEET_BLOCKED, ['sana (yyyy-mm-dd)', 'vaqt (HH:mm yoki BARCHASI)', 'sabab']);
  ['Лист1', 'Sheet1'].forEach(function (n) { var s = spreadsheet.getSheetByName(n); if (s) spreadsheet.deleteSheet(s); });
  Logger.log('Jadvallar tayyor!');
}

/** Deploy qilingandan keyin bir marta: webhook, menyu tugmasi, buyruqlar, eslatma trigger */
function setupBot() {
  var url = getProp('WEBAPP_URL') || ScriptApp.getService().getUrl();
  Logger.log('Webhook: ' + JSON.stringify(tg_('setWebhook', { url: url, drop_pending_updates: true, allowed_updates: ['message', 'callback_query'] })));
  Logger.log('Menu: ' + JSON.stringify(tg_('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Yozilish', web_app: { url: SITE_URL } } })));
  Logger.log('Commands: ' + JSON.stringify(tg_('setMyCommands', { commands: [
    { command: 'start', description: 'Bosh menyu' },
    { command: 'qabullarim', description: 'Mening qabullarim' }
  ] })));
  createReminderTrigger();
}

function createReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkReminders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(5).create();
  Logger.log('Eslatma trigger yaratildi (har 5 daqiqada)');
}

/* ===================== HTTP ===================== */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'slots') {
      var dur = Math.max(10, Math.min(240, Number(p.dur) || 30));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) return json_({ ok: false, error: 'bad date' });
      return json_({ ok: true, date: p.date, slots: getSlots_(p.date, dur) });
    }
    if (p.action === 'config') {
      return json_({ ok: true, days: getDays_(14) });
    }
    return json_({ ok: true, service: 'sartarosh-bot' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }

  // 1) Telegram webhook
  if (body.update_id !== undefined) {
    try {
      if (isNewUpdate_(body.update_id)) {
        if (body.message) handleMessage_(body.message);
        else if (body.callback_query) handleCallback_(body.callback_query);
      }
    } catch (err) { Logger.log('update error: ' + err); }
    return ContentService.createTextOutput('ok');
  }

  // 2) Saytdan yozilish
  if (body.action === 'book') {
    try { return json_(webBook_(body)); } catch (err) { return json_({ ok: false, error: String(err) }); }
  }
  return json_({ ok: false, error: 'unknown action' });
}

function isNewUpdate_(updateId) {
  var cache = CacheService.getScriptCache();
  var key = 'upd_' + updateId;
  if (cache.get(key)) return false;
  cache.put(key, '1', 21600);
  return true;
}

/* ===================== VAQT / SLOTLAR ===================== */

function toMin_(t) {
  if (t instanceof Date) return t.getHours() * 60 + t.getMinutes();
  var p = String(t).split(':');
  return Number(p[0]) * 60 + Number(p[1] || 0);
}
function fmtMin_(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
function fmtDate_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v); }
function fmtTime_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'HH:mm') : String(v); }
function todayStr_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function nowMin_() { return toMin_(Utilities.formatDate(new Date(), TZ, 'HH:mm')); }
function dow_(dateStr) {
  var p = dateStr.split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
}
function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE' || String(v) === '1'; }

function getSchedule_(dateStr) {
  var dow = dow_(dateStr);
  var data = sheet_(SHEET_SCHEDULE).getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === dow) {
      return { open: isTrue_(data[i][5]), from: toMin_(data[i][2]), to: toMin_(data[i][3]), step: Number(data[i][4]) || 30 };
    }
  }
  return null;
}

function getDays_(n) {
  var out = [];
  var base = new Date();
  for (var i = 0; i < n; i++) {
    var d = Utilities.formatDate(new Date(base.getTime() + i * 86400000), TZ, 'yyyy-MM-dd');
    var s = getSchedule_(d);
    out.push({ date: d, dow: dow_(d), open: !!(s && s.open && !isDayBlocked_(d)) });
  }
  return out;
}

function busy_(dateStr) {
  var data = sheet_(SHEET_BOOKINGS).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var st = data[i][C.STATUS - 1];
    if (fmtDate_(data[i][C.DATE - 1]) === dateStr && (st === 'BOOKED' || st === 'CONFIRMED')) {
      var s = toMin_(fmtTime_(data[i][C.TIME - 1]));
      out.push([s, s + (Number(data[i][C.DUR - 1]) || 30)]);
    }
  }
  return out;
}

function blocked_(dateStr, step) {
  var data = sheet_(SHEET_BLOCKED).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (fmtDate_(data[i][0]) !== dateStr) continue;
    var v = String(data[i][1] instanceof Date ? fmtTime_(data[i][1]) : data[i][1]).trim();
    if (!v || v.toUpperCase() === 'BARCHASI') out.push([0, 24 * 60]);
    else { var s = toMin_(v); out.push([s, s + step]); }
  }
  return out;
}
function isDayBlocked_(dateStr) {
  return blocked_(dateStr, 30).some(function (b) { return b[0] === 0 && b[1] === 1440; });
}

function getSlots_(dateStr, dur) {
  var sc = getSchedule_(dateStr);
  if (!sc || !sc.open) return [];
  if (dateStr < todayStr_()) return [];
  var taken = busy_(dateStr).concat(blocked_(dateStr, sc.step));
  var isToday = dateStr === todayStr_();
  var now = nowMin_();
  var slots = [];
  for (var m = sc.from; m + dur <= sc.to; m += sc.step) {
    if (isToday && m <= now + 15) continue;
    var clash = taken.some(function (t) { return m < t[1] && m + dur > t[0]; });
    if (!clash) slots.push(fmtMin_(m));
  }
  return slots;
}

/* ===================== SAYTDAN YOZILISH ===================== */

/** Telegram Web App initData ni tekshiradi; to'g'ri bo'lsa user obyektini qaytaradi */
function verifyInitData_(initData) {
  if (!initData) return null;
  var pairs = String(initData).split('&');
  var map = {}, hash = '';
  pairs.forEach(function (p) {
    var i = p.indexOf('=');
    var k = decodeURIComponent(p.slice(0, i)), v = decodeURIComponent(p.slice(i + 1));
    if (k === 'hash') hash = v; else map[k] = v;
  });
  var check = Object.keys(map).sort().map(function (k) { return k + '=' + map[k]; }).join('\n');
  var secret = Utilities.computeHmacSha256Signature(
    Utilities.newBlob(BOT_TOKEN()).getBytes(), Utilities.newBlob('WebAppData').getBytes());
  var sig = Utilities.computeHmacSha256Signature(Utilities.newBlob(check).getBytes(), secret);
  var hex = sig.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  if (hex !== hash) return null;
  if (Number(map.auth_date) * 1000 < Date.now() - 24 * 3600 * 1000) return null;
  try { return JSON.parse(map.user); } catch (e) { return null; }
}

function webBook_(b) {
  var svc = SERVICES[Number(b.svc)];
  if (!svc) return { ok: false, error: 'Xizmat topilmadi' };
  var date = String(b.date || ''), time = String(b.time || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: 'Sana/vaqt noto\'g\'ri' };
  var name = String(b.name || '').trim().slice(0, 60);
  var phone = String(b.phone || '').replace(/[^\d+]/g, '').slice(0, 16);
  var note = String(b.note || '').trim().slice(0, 200);
  if (!name) return { ok: false, error: 'Ismingizni kiriting' };
  if (phone.replace(/\D/g, '').length < 9) return { ok: false, error: 'Telefon raqam noto\'g\'ri' };

  var user = verifyInitData_(b.initData);
  var tgId = user ? String(user.id) : '';

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'Server band, qayta urinib ko\'ring' };
  try {
    if (getSlots_(date, svc.time).indexOf(time) === -1) {
      return { ok: false, taken: true, error: 'Bu vaqt band bo\'lib qoldi, boshqa vaqt tanlang' };
    }
    var id = Utilities.getUuid().slice(0, 8);
    sheet_(SHEET_BOOKINGS).appendRow([id, tgId, name, phone, date, time, 'BOOKED', '',
      Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), svc.name, String(svc.time), note, tgId ? 'telegram' : 'sayt']);
    if (tgId) upsertClient_(tgId, name, phone, user.username || '');
  } finally {
    lock.releaseLock();
  }

  var line = svc.name + '\n📅 ' + prettyDate_(date) + ', ' + time + ' (' + svc.time + ' daq)';
  if (ADMIN_ID()) {
    send_(ADMIN_ID(), '🔔 Yangi qabul\n\n👤 ' + name + '\n📞 ' + phone + '\n✂️ ' + line + (note ? '\n💬 ' + note : '') +
      '\n\nManba: ' + (tgId ? 'Telegram' : 'sayt'),
      { reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'acancel_' + id }]] } });
  }
  if (tgId) {
    send_(tgId, '✅ Siz yozildingiz!\n\n✂️ ' + line + '\n\nQabulga 1 soat qolganda eslatma yuboraman.',
      { reply_markup: { inline_keyboard: [[{ text: '🗓 Mening qabullarim', callback_data: 'my' }]] } });
  }
  return { ok: true, id: id, telegram: !!tgId };
}

function upsertClient_(tgId, name, phone, username) {
  var sh = sheet_(SHEET_CLIENTS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(tgId)) {
      if (phone) sh.getRange(i + 1, 3).setValue(phone);
      return;
    }
  }
  sh.appendRow([String(tgId), name, phone, username, Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')]);
}

var MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
var WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
function prettyDate_(d) {
  var p = d.split('-');
  return WEEKDAYS[dow_(d)] + ', ' + Number(p[2]) + '-' + MONTHS[Number(p[1]) - 1];
}

/* ===================== TELEGRAM BOT ===================== */

function isAdmin_(chatId) { return !!ADMIN_ID() && String(chatId) === String(ADMIN_ID()); }

function mainMenu_(chatId) {
  var kb = [
    [{ text: '✂️ Yozilish', web_app: { url: SITE_URL + '#book' } }],
    [{ text: '🗓 Mening qabullarim', callback_data: 'my' }]
  ];
  if (isAdmin_(chatId)) kb.push([{ text: '💈 Sartarosh paneli', callback_data: 'admin' }]);
  send_(chatId, '💈 Beka Barber\n\nQabulga yozilish uchun pastdagi tugmani bosing.', { reply_markup: { inline_keyboard: kb } });
}

function handleMessage_(msg) {
  if (!msg.chat || msg.chat.type !== 'private') return;
  var chatId = msg.chat.id;
  var text = (msg.text || '').trim();

  if (text.indexOf('/admin') === 0) {
    var code = text.split(/\s+/)[1] || '';
    if (isAdmin_(chatId)) return adminMenu_(chatId);
    if (getProp('ADMIN_CODE') && code === getProp('ADMIN_CODE')) {
      setProp('ADMIN_TELEGRAM_ID', chatId);
      send_(chatId, '✅ Siz sartarosh (admin) sifatida belgilandingiz. Yangi qabullar haqida xabar shu yerga keladi.');
      return adminMenu_(chatId);
    }
    return send_(chatId, 'Bu buyruq faqat sartarosh uchun.');
  }
  if (text === '/qabullarim') return myBookings_(chatId, null);
  mainMenu_(chatId);
}

function handleCallback_(cq) {
  var chatId = cq.message.chat.id, mid = cq.message.message_id, d = cq.data || '';
  tg_('answerCallbackQuery', { callback_query_id: cq.id });

  if (d === 'my') return myBookings_(chatId, mid);
  if (d.indexOf('cancel_') === 0) return confirmCancel_(chatId, mid, d.slice(7));
  if (d.indexOf('cyes_') === 0) return cancelBooking_(chatId, mid, d.slice(5), false);
  if (d === 'cno') return edit_(chatId, mid, 'Yaxshi, qabul saqlanib qoldi 👍');
  if (d.indexOf('ryes_') === 0) return attendance_(chatId, mid, d.slice(5), true);
  if (d.indexOf('rno_') === 0) return attendance_(chatId, mid, d.slice(4), false);

  if (!isAdmin_(chatId)) return;
  if (d === 'admin') return adminMenu_(chatId, mid);
  if (d === 'aday0') return adminDay_(chatId, mid, 0);
  if (d === 'aday1') return adminDay_(chatId, mid, 1);
  if (d.indexOf('acancel_') === 0) return cancelBooking_(chatId, mid, d.slice(8), true);
  if (d.indexOf('adone_') === 0) return setStatusAdmin_(chatId, mid, d.slice(6), 'COMPLETED');
  if (d.indexOf('anoshow_') === 0) return setStatusAdmin_(chatId, mid, d.slice(8), 'NO_SHOW');
}

function rows_() { return sheet_(SHEET_BOOKINGS).getDataRange().getValues(); }
function findRow_(id) {
  var data = rows_();
  for (var i = 1; i < data.length; i++) if (String(data[i][0]) === String(id)) return { i: i + 1, r: data[i] };
  return null;
}
function when_(r) { return fmtDate_(r[C.DATE - 1]) + ' ' + fmtTime_(r[C.TIME - 1]); }
function isFuture_(r) {
  var d = fmtDate_(r[C.DATE - 1]), t = toMin_(fmtTime_(r[C.TIME - 1]));
  return d > todayStr_() || (d === todayStr_() && t > nowMin_());
}

function myBookings_(chatId, mid) {
  var data = rows_(), kb = [], lines = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i], st = r[C.STATUS - 1];
    if (String(r[C.TG - 1]) !== String(chatId) || (st !== 'BOOKED' && st !== 'CONFIRMED') || !isFuture_(r)) continue;
    lines.push('• ' + prettyDate_(fmtDate_(r[C.DATE - 1])) + ', ' + fmtTime_(r[C.TIME - 1]) + ' — ' + (r[C.SVC - 1] || 'qabul') + (st === 'CONFIRMED' ? ' ✅' : ''));
    kb.push([{ text: '❌ ' + fmtDate_(r[C.DATE - 1]).slice(5) + ' ' + fmtTime_(r[C.TIME - 1]) + ' ni bekor qilish', callback_data: 'cancel_' + r[0] }]);
  }
  kb.push([{ text: '✂️ Yangi yozilish', web_app: { url: SITE_URL + '#book' } }]);
  var text = lines.length ? '🗓 Sizning qabullaringiz:\n\n' + lines.join('\n') : 'Sizda faol qabul yo\'q.';
  mid ? edit_(chatId, mid, text, { reply_markup: { inline_keyboard: kb } }) : send_(chatId, text, { reply_markup: { inline_keyboard: kb } });
}

function confirmCancel_(chatId, mid, id) {
  var f = findRow_(id);
  if (!f || String(f.r[C.TG - 1]) !== String(chatId)) return edit_(chatId, mid, 'Qabul topilmadi.');
  edit_(chatId, mid, 'Qabulni bekor qilasizmi?\n\n' + when_(f.r) + ' — ' + (f.r[C.SVC - 1] || ''), {
    reply_markup: { inline_keyboard: [[{ text: 'Ha, bekor qilish', callback_data: 'cyes_' + id }, { text: 'Yo\'q', callback_data: 'cno' }]] }
  });
}

function cancelBooking_(chatId, mid, id, byAdmin) {
  var f = findRow_(id);
  if (!f) return edit_(chatId, mid, 'Qabul topilmadi.');
  if (!byAdmin && String(f.r[C.TG - 1]) !== String(chatId)) return edit_(chatId, mid, 'Qabul topilmadi.');
  var st = f.r[C.STATUS - 1];
  if (st !== 'BOOKED' && st !== 'CONFIRMED') return edit_(chatId, mid, 'Bu qabul allaqachon yopilgan (' + st + ').');
  sheet_(SHEET_BOOKINGS).getRange(f.i, C.STATUS).setValue('CANCELLED');
  var w = when_(f.r);
  edit_(chatId, mid, '❌ Qabul bekor qilindi: ' + w + '\nBu vaqt yana bo\'sh.');
  if (byAdmin) {
    if (f.r[C.TG - 1]) send_(f.r[C.TG - 1], '❌ Afsuski, sartarosh ' + w + ' dagi qabulingizni bekor qildi. Boshqa vaqtga yozilishingiz mumkin.',
      { reply_markup: { inline_keyboard: [[{ text: '✂️ Qayta yozilish', web_app: { url: SITE_URL + '#book' } }]] } });
  } else if (ADMIN_ID()) {
    send_(ADMIN_ID(), '❌ Mijoz qabulni bekor qildi\n\n👤 ' + f.r[C.NAME - 1] + '\n📅 ' + w + '\nBu vaqt yana bo\'sh.');
  }
}

function attendance_(chatId, mid, id, yes) {
  var f = findRow_(id);
  if (!f || String(f.r[C.TG - 1]) !== String(chatId)) return edit_(chatId, mid, 'Qabul topilmadi.');
  var w = when_(f.r);
  if (yes) {
    sheet_(SHEET_BOOKINGS).getRange(f.i, C.STATUS).setValue('CONFIRMED');
    edit_(chatId, mid, '✅ Rahmat! Kutib qolamiz — ' + w);
    if (ADMIN_ID()) send_(ADMIN_ID(), '🟢 ' + f.r[C.NAME - 1] + ' ' + w + ' dagi qabulini tasdiqladi.');
  } else {
    sheet_(SHEET_BOOKINGS).getRange(f.i, C.STATUS).setValue('CANCELLED');
    edit_(chatId, mid, 'Tushunarli, qabul bekor qilindi. Boshqa safar kutamiz!');
    if (ADMIN_ID()) send_(ADMIN_ID(), '❌ ' + f.r[C.NAME - 1] + ' ' + w + ' ga kela olmasligini aytdi. Vaqt bo\'shadi.');
  }
}

function adminMenu_(chatId, mid) {
  var kb = { inline_keyboard: [
    [{ text: '📅 Bugungi qabullar', callback_data: 'aday0' }],
    [{ text: '📆 Ertangi qabullar', callback_data: 'aday1' }],
    [{ text: '📊 Jadvalni ochish', url: ss().getUrl() }]
  ] };
  var t = '💈 Sartarosh paneli\n\nIsh vaqtini "Schedule", yopiq kun/vaqtni "Blocked" varag\'ida o\'zgartirasiz.';
  mid ? edit_(chatId, mid, t, { reply_markup: kb }) : send_(chatId, t, { reply_markup: kb });
}

function adminDay_(chatId, mid, offset) {
  var date = Utilities.formatDate(new Date(Date.now() + offset * 86400000), TZ, 'yyyy-MM-dd');
  var data = rows_(), list = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (fmtDate_(r[C.DATE - 1]) === date && r[C.STATUS - 1] !== 'CANCELLED') list.push(r);
  }
  list.sort(function (a, b) { return fmtTime_(a[C.TIME - 1]) < fmtTime_(b[C.TIME - 1]) ? -1 : 1; });
  var icon = { BOOKED: '⏳', CONFIRMED: '🟢', COMPLETED: '✔️', NO_SHOW: '🚫' };
  var text = '📅 ' + prettyDate_(date) + '\n\n' + (list.length ? list.map(function (r) {
    return (icon[r[C.STATUS - 1]] || '') + ' ' + fmtTime_(r[C.TIME - 1]) + ' — ' + r[C.NAME - 1] + ' (' + r[C.PHONE - 1] + ')\n    ' + (r[C.SVC - 1] || '');
  }).join('\n') : 'Qabullar yo\'q.');
  var kb = [];
  list.forEach(function (r) {
    if (r[C.STATUS - 1] === 'BOOKED' || r[C.STATUS - 1] === 'CONFIRMED') {
      kb.push([
        { text: '✔️ ' + fmtTime_(r[C.TIME - 1]) + ' keldi', callback_data: 'adone_' + r[0] },
        { text: '🚫 kelmadi', callback_data: 'anoshow_' + r[0] },
        { text: '❌', callback_data: 'acancel_' + r[0] }
      ]);
    }
  });
  kb.push([{ text: '⬅️ Orqaga', callback_data: 'admin' }]);
  edit_(chatId, mid, text, { reply_markup: { inline_keyboard: kb } });
}

function setStatusAdmin_(chatId, mid, id, status) {
  var f = findRow_(id);
  if (!f) return;
  sheet_(SHEET_BOOKINGS).getRange(f.i, C.STATUS).setValue(status);
  adminDay_(chatId, mid, fmtDate_(f.r[C.DATE - 1]) === todayStr_() ? 0 : 1);
}

/* ===================== ESLATMA (har 5 daqiqada trigger) ===================== */

function checkReminders() {
  var sh = sheet_(SHEET_BOOKINGS);
  var data = sh.getDataRange().getValues();
  var today = todayStr_(), now = nowMin_();
  var tomorrow = Utilities.formatDate(new Date(Date.now() + 86400000), TZ, 'yyyy-MM-dd');
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (r[C.STATUS - 1] !== 'BOOKED' || r[C.REMIND - 1] || !r[C.TG - 1]) continue;
    var d = fmtDate_(r[C.DATE - 1]), t = toMin_(fmtTime_(r[C.TIME - 1]));
    var diff = d === today ? t - now : (d === tomorrow ? t + 1440 - now : 9999);
    if (diff <= 65 && diff > 0) {
      send_(r[C.TG - 1], '🔔 Qabulingizga taxminan 1 soat qoldi!\n\n✂️ ' + (r[C.SVC - 1] || '') + '\n🕐 ' + fmtTime_(r[C.TIME - 1]) +
        '\n📍 Toshkent, Chilonzor, 9-kvartal, Bunyodkor 18\n\nKelasizmi?', {
        reply_markup: { inline_keyboard: [[{ text: '✅ Ha, kelaman', callback_data: 'ryes_' + r[0] }, { text: '❌ Kela olmayman', callback_data: 'rno_' + r[0] }]] }
      });
      sh.getRange(i + 1, C.REMIND).setValue('YES');
    }
  }
}

/* ===================== TELEGRAM API ===================== */

function tg_(method, payload) {
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN() + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  try { return JSON.parse(res.getContentText()); } catch (e) { return { ok: false }; }
}
function send_(chatId, text, extra) {
  var p = { chat_id: chatId, text: text };
  if (extra) for (var k in extra) p[k] = extra[k];
  return tg_('sendMessage', p);
}
function edit_(chatId, mid, text, extra) {
  var p = { chat_id: chatId, message_id: mid, text: text };
  if (extra) for (var k in extra) p[k] = extra[k];
  var r = tg_('editMessageText', p);
  if (!r.ok) send_(chatId, text, extra);
}
