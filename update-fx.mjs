/* Ежедневное обновление курсов для мини-приложения.
   Запускается рабочим процессом GitHub Actions, пишет fx.js рядом с index.html.

   Правило компании: каждая страна считается по курсу СВОЕГО центробанка,
   кросс-курсы запрещены. Поэтому запасные адреса — это ДРУГИЕ КАНАЛЫ ТОГО ЖЕ
   центробанка (или его официальное зеркало), а не сторонние агрегаторы курсов.
   Порядок для каждой страны: основной канал → запасной → зеркало. */

const dd = d => String(d).padStart(2, "0");
const now = new Date();
const D = `${dd(now.getDate())}.${dd(now.getMonth() + 1)}.${now.getFullYear()}`;

const num = x => Math.round(x * 1e4) / 1e4;

async function get(url, kind) {
  const r = await fetch(url, { headers: { "User-Agent": "EncarExport-MiniApp/1.0" } });
  if (!r.ok) throw new Error(url + " → HTTP " + r.status);
  if (kind === "json") return r.json();
  if (kind === "cp1251") return Buffer.from(await r.arrayBuffer()).toString("latin1");
  return r.text();
}

/* ── РОССИЯ ── */
const cbrXml = t => {
  const pick = c => {
    const m = t.match(new RegExp(`<CharCode>${c}</CharCode>[\\s\\S]*?<Nominal>(\\d+)</Nominal>[\\s\\S]*?<Value>([\\d,]+)</Value>`));
    if (!m) throw new Error("ЦБ РФ: нет " + c);
    return parseFloat(m[2].replace(",", ".")) / parseInt(m[1], 10);
  };
  return { usd: num(pick("USD")), eur: num(pick("EUR")), krw: num(pick("KRW") * 1000) };
};
const RF = [
  ["cbr.ru — официальный", async () => cbrXml(await get("https://www.cbr.ru/scripts/XML_daily.asp", "cp1251"))],
  ["cbr-xml-daily.ru — зеркало ЦБ РФ", async () => {
    const j = await get("https://www.cbr-xml-daily.ru/daily_json.js", "json");
    const p = c => j.Valute[c].Value / j.Valute[c].Nominal;
    return { usd: num(p("USD")), eur: num(p("EUR")), krw: num(p("KRW") * 1000) };
  }],
];

/* ── КАЗАХСТАН ── */
const kzRss = t => {
  const pick = c => {
    const m = t.match(new RegExp(`<title>${c}</title>[\\s\\S]*?<description>([\\d.]+)</description>[\\s\\S]*?<quant>(\\d+)</quant>`))
           || t.match(new RegExp(`<title>${c}</title>[\\s\\S]*?<description>([\\d.]+)</description>`));
    if (!m) throw new Error("НБ РК: нет " + c);
    return { v: parseFloat(m[1]), q: m[2] ? parseInt(m[2], 10) : 1 };
  };
  const u = pick("USD"), e = pick("EUR"), k = pick("KRW");
  return { usd: num(u.v / u.q), eur: num(e.v / e.q), krw100: num(k.v / k.q * 100) };
};
const KZ = [
  ["nationalbank.kz — курсы на дату", async () => kzRss(await get("https://nationalbank.kz/rss/get_rates.cfm?fdate=" + D))],
  ["nationalbank.kz — общий поток курсов", async () => kzRss(await get("https://nationalbank.kz/rss/rates_all.xml"))],
];

/* ── БЕЛАРУСЬ ── */
const byJson = a => {
  const pick = c => {
    const x = a.find(v => v.Cur_Abbreviation === c);
    if (!x) throw new Error("НБ РБ: нет " + c);
    return x.Cur_OfficialRate / (x.Cur_Scale || 1);
  };
  return { usd: num(pick("USD")), eur: num(pick("EUR")), krw: num(pick("KRW") * 1000) };
};
/* НБ РБ держит два списка: ежедневный (periodicity=0) и ежемесячный
   (periodicity=1). Доллар и евро — в ежедневном, южнокорейская вона — в
   ежемесячном. Запрос только к ежедневному списку падал на «нет KRW», и
   Беларусь оставалась на сохранённом курсе. Берём оба списка и склеиваем:
   ежедневный первым, чтобы USD и EUR приходили из него. */
const byBoth = async host => {
  const daily = await get(host + "/exrates/rates?periodicity=0", "json");
  let all = Array.isArray(daily) ? daily.slice() : [];
  try {
    const monthly = await get(host + "/exrates/rates?periodicity=1", "json");
    if (Array.isArray(monthly)) all = all.concat(monthly);
  } catch (e) { /* ежемесячный список не ответил — пробуем на том, что есть */ }
  return byJson(all);
};
const BY = [
  ["api.nbrb.by — основной хост", () => byBoth("https://api.nbrb.by")],
  ["www.nbrb.by/api — запасной хост", () => byBoth("https://www.nbrb.by/api")],
];

/* ── сборка ── */
const out = { date: D, checked_at: now.toISOString() };
const log = [], failed = [];

for (const [key, chain] of [["rf", RF], ["kz", KZ], ["by", BY]]) {
  let done = false;
  for (const [name, fn] of chain) {
    try {
      const v = await fn();
      out[key] = { ...v, _source: name };
      log.push(`${key}: ${name}`);
      done = true;
      break;
    } catch (e) {
      log.push(`${key}: ${name} — не вышло (${e.message})`);
    }
  }
  if (!done) failed.push(key);
}

console.log(log.join("\n"));

if (failed.length === 3) {
  console.error("Ни один канал не ответил. Файл fx.js не тронут — приложение продолжит работать на прежних курсах.");
  process.exit(1);
}
if (failed.length) console.warn("Без курса остались страны: " + failed.join(", ") + " — они возьмут прежние значения.");

/* Страны, по которым сегодня не вышло, сохраняют прежние значения из fx.js */
const fs = await import("node:fs");
if (failed.length) {
  try {
    const old = fs.readFileSync("fx.js", "utf8");
    const m = old.match(/window\.ENCAR_FX\s*=\s*([\s\S]*);\s*$/);
    if (m) {
      const prev = JSON.parse(m[1]);
      for (const k of failed) if (prev[k]) { out[k] = prev[k]; out[k]._stale = "курс не обновился " + D; }
    }
  } catch {}
}

fs.writeFileSync("fx.js",
  "/* Курсы центробанков. Файл создаётся автоматически, руками не править.\n" +
  "   Обновляется рабочим процессом .github/workflows/fx.yml.\n" +
  "   Каждая страна — по курсу своего центробанка; запасные адреса принадлежат\n" +
  "   тому же центробанку. Кросс-курсы и сторонние агрегаторы не используются. */\n" +
  "window.ENCAR_FX = " + JSON.stringify(out, null, 1) + ";\n");

console.log("fx.js обновлён на " + D + (failed.length ? " (частично)" : ""));
