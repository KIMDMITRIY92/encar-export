/* ══════════════════════════════════════════════════════════════════
   ENCAR EXPORT — РАСЧЁТНОЕ ЯДРО (РФ · КЗ · РБ)
   calc.js · ред. 1.0 от 04.09.2026

   ЗАЧЕМ ЭТОТ ФАЙЛ СУЩЕСТВУЕТ.
   До него формулы жили внутри index.html, в трёх независимых блоках
   <script> — по одному на страну. Общие функции (dutyRate, ettMin,
   ageYears, bandOf, madeMoment, declDate) были продублированы во всех
   трёх копиями. Достаточно было поправить ставку в российском блоке и
   забыть про два других, чтобы калькулятор начал считать одну страну по
   новой норме, а две — по старой, и никакая проверка сумм этого бы не
   поймала: все цифры при этом верные.
   Вторая причина — витрина канала: публикатор обязан показывать в посте
   ту же цену, что клиент увидит в мини-приложении. Пока это две разные
   реализации, совпадение — вопрос везения. Теперь это один файл:
   мини-приложение подключает его тегом <script src="calc.js">,
   публикатор скачивает и исполняет тот же текст.

   ЧТО ЗДЕСЬ ЕСТЬ И ЧЕГО НЕТ.
   Есть: чистые функции, которые получают числа и возвращают числа.
   Нет: ни одного обращения к DOM, ни одной ставки. Ставки приходят
   параметром R — это window.ENCAR_RATES из rates.js. Ставка, зашитая
   сюда, — стоп-критерий QA С-01.

   ФОРМУЛЫ ПЕРЕНЕСЕНЫ ДОСЛОВНО из боевого index.html (снят 04.09.2026).
   Порядок действий, округления и даже порядок max/min сохранены — иначе
   расхождение в копейку на границе не поймается глазом.
   ══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ── ВОЗРАСТ ─────────────────────────────────────────────────────
     База возраста — дата ИЗГОТОВЛЕНИЯ (Решение Коллегии ЕЭК от
     30.06.2017 № 74, п. 5), а не первой регистрации.
     Правило неподтверждённого месяца: год+месяц → 15-е число,
     только год → 1 июля. Цена ошибки на тест-кейсе — 422 304 ₽.

     ЛОВУШКА ЧАСОВОГО ПОЯСА, оставлена сознательно: обе даты строятся в
     ЛОКАЛЬНОМ времени, поэтому смещение пояса в разности сокращается.
     Переводить на UTC нельзя — это изменило бы вывод мини-приложения. */
  function madeMoment(year, month, monthConfirmed) {
    var y = +year || 0;
    if (monthConfirmed) { var m = +month || 7; return new Date(y, m - 1, 15); }
    return new Date(y, 6, 1);
  }
  function declDate(iso) {
    return iso ? new Date(iso + 'T00:00:00') : new Date();
  }
  function ageYears(declISO, year, month, monthConfirmed) {
    return (declDate(declISO) - madeMoment(year, month, monthConfirmed))
           / (365.2425 * 24 * 3600 * 1000);
  }
  function bandOf(a) { return a < 3 ? 'new' : a <= 5 ? 'mid' : 'old'; }
  function bandName(b) {
    return b === 'new' ? 'до 3 лет' : b === 'mid' ? '3–5 лет' : 'старше 5 лет';
  }

  /* ── ЕДИНАЯ СТАВКА ЕАЭС И ЕТТ ─────────────────────────────────── */
  function dutyRate(R, cc, band) {
    var t = band === 'mid' ? R.eaeu.duty35 : band === 'old' ? R.eaeu.duty5 : null;
    if (!t) return null;
    for (var i = 0; i < t.length; i++) if (cc <= t[i][0]) return t[i][1];
  }
  function ettMin(R, cc, old7) {
    var E = R.eaeu.ett;
    if (cc >= E.ccMin && cc < E.ccMid)  return old7 ? E.cc1500_1800.old7 : E.cc1500_1800.neu;
    if (cc >= E.ccMid && cc <= E.ccMax) return old7 ? E.cc1800_3000.old7 : E.cc1800_3000.neu;
    return null;
  }

  /* Единая ставка для физлица. До 3 лет — max(процент от стоимости;
     минимум €/см³) по шкале стоимости в ЕВРО; 3 лет и старше — только
     €/см³. Возвращаем и режим строкой: он печатается в разбивке. */
  function dutyPersonal(R, cc, band, customsValue, eurRate) {
    if (band === 'new') {
      var cvEur = eurRate > 0 ? customsValue / eurRate : 0;
      var br = R.eaeu.dutyLt3.find(function (b) { return cvEur <= b[0]; });
      var pp = customsValue * br[1], mp = cc * br[2] * eurRate;
      return { v: Math.max(pp, mp),
               m: (pp >= mp) ? (br[1] * 100) + '% ст-ти' : 'мин ' + br[2] + ' €/см³' };
    }
    var rt = dutyRate(R, cc, band);
    return { v: cc * rt * eurRate, m: rt + ' €/см³' };
  }

  /* Коммерческая пошлина ЕТТ — одинакова во всех трёх странах. */
  function dutyEtt(R, cc, age, customsValue, eurRate) {
    var old7 = age > 7, mn = ettMin(R, cc, old7);
    if (old7) {
      var r7 = (mn !== null ? mn : R.eaeu.ett.fallbackMinOld7);
      return { v: r7 * cc * eurRate, m: r7 + ' €/см³ (>7 лет)' };
    }
    var rate = (mn !== null ? mn : R.eaeu.ett.fallbackMin);
    var pp = customsValue * R.eaeu.ett.adValorem, mp = rate * cc * eurRate;
    return { v: Math.max(pp, mp),
             m: (pp >= mp ? (R.eaeu.ett.adValorem * 100) + '% ТС' : 'мин ' + rate + ' €/см³')
                + ' (б/у до 7 лет)',
             unknownCc: mn === null };
  }

  /* ══════════════ РОССИЯ ══════════════════════════════════════════
     Вход:
       usd, eur, krwr        курсы ЦБ РФ (krwr — за 1000 вон)
       cc, kw, hp            объём, кВт, л.с.
       year, month, monthConfirmed, declISO
       mode 'deal'|'lot', buyUsd | buyKrw
       log, brk, misc, rflog фрахт $, брокер ₽, СВХ ₽, логистика РФ ₽
       fxAdd                 надбавка к курсу, % (закуп и фрахт)
       exRate                акциз ₽/л.с. (коммерческая ветка)
       personal, purposeOwn  статус и цель ввоза
       importedLastYear      'yes'|'no' — ввозил ли авто за 12 мес
       fuel                  'ice' | иное (электро/гибрид)
       market, markupRub     для вердикта                            */
  function calcRU(i, R) {
    var usd = +i.usd || 0, eur = +i.eur || 0, krwr = +i.krwr || 0;
    var cc = +i.cc || 0, kw = +i.kw || 0, hp = +i.hp || 0;
    var a = ageYears(i.declISO, i.year, i.month, i.monthConfirmed !== false);
    var band = bandOf(a);
    var log = +i.log || 0, brk = +i.brk || 0, misc = +i.misc || 0, rflog = +i.rflog || 0;
    var mk = 1 + ((+i.fxAdd || 0) / 100);
    var cv0 = i.mode === 'lot' ? (+i.buyKrw || 0) * (krwr / 1000) : (+i.buyUsd || 0) * usd;
    var log0 = log * usd, TS = cv0 + log0;
    var cvRub = cv0 * mk, logR = log0 * mk;
    var fxPad = (cvRub - cv0) + (logR - log0);

    var duty = 0, dmode = '', excise = 0, vat = 0, fee = 0;
    var pers = (i.personal !== false) && (i.purposeOwn !== false);

    if (pers) {
      var d = dutyPersonal(R, cc, band, cv0, eur);
      duty = d.v; dmode = d.m;
      /* Ставка 689 ₽ для товаров личного пользования ОТМЕНЕНА решением
         владельца 04.09.2026 (правка методики № 25): сбор считается по
         общей шкале и физлицу тоже. */
      fee = feeScale(R, TS);
    } else {
      var e = dutyEtt(R, cc, a, TS, eur);
      duty = e.v; dmode = e.m;
      excise = hp * (+i.exRate || 0);
      vat = (TS + duty + excise) * R.rf.vat.value;
      fee = feeScale(R, TS);
    }

    /* Утильсбор. Льгота — ТОЛЬКО при выполнении ОБОИХ условий:
       объём ≤ порога И мощность ≤ порога, оба включительно (правило
       владельца П-1 от 03.09.2026). Превышение любого одного снимает
       льготу целиком. */
    var isEv = i.fuel !== 'ice';
    var kwCapEff = isEv ? R.rf.utilPref.kwCapEv : R.rf.kwCap.value;
    var eligible = pers && kw <= kwCapEff
                   && i.importedLastYear !== 'yes'
                   && (isEv || cc <= R.rf.utilPref.ccMax);
    var ai = band === 'new' ? 0 : 1;
    var kC = isEv ? R.rf.utilEv.k[powIdxEv(R, kw)][ai] : grpFor(R, cc)[powIdx(R, kw)][ai];
    var kL = eligible ? (band === 'new' ? R.rf.utilPref.neu : R.rf.utilPref.old) : kC;
    var BASE = R.rf.utilBase.value;
    var util = BASE * kL, utilC = BASE * kC, surcharge = utilC - util;

    var gov = duty + excise + vat + fee + util;
    var vvo = cvRub + logR + gov + brk + misc;
    var full = vvo + rflog;

    var market = +i.market || 0;
    var profit = (i.mode === 'deal' && market > 0) ? market - full : null;
    var pct = (profit !== null && full) ? profit / full * 100 : null;

    return {
      country: 'RU', currency: 'RUB',
      age: a, band: band, bandName: bandName(band), personal: pers,
      priceLocal: cv0, freight: log0, customsValue: TS,
      fxMarkup: fxPad, priceWithMarkup: cvRub, freightWithMarkup: logR,
      duty: duty, dutyMode: dmode, excise: excise, vat: vat, fee: fee,
      util: util, utilCommercial: utilC, utilSurcharge: surcharge,
      utilEligible: eligible, utilK: kL, utilKCommercial: kC,
      gov: gov, costVladivostok: vvo, total: full,
      profit: profit, profitPct: pct,
      clientPrice: i.mode === 'lot' ? full + (+i.markupRub || 0) : null,
    };
  }

  function feeScale(R, ts) {
    var T = R.rf.feeScale.table;
    for (var i = 0; i < T.length; i++) if (ts <= T[i][0]) return T[i][1];
    return T[T.length - 1][1];
  }
  function powIdx(R, kw) {
    var P = R.rf.util.pow;
    for (var i = 0; i < P.length; i++) if (kw <= P[i]) return i;
    return 15;
  }
  function powIdxEv(R, kw) {
    var P = R.rf.utilEv.pow;
    for (var i = 0; i < P.length; i++) if (kw <= P[i]) return i;
    return P.length - 1;
  }
  function grpFor(R, cc) {
    var U = R.rf.util;
    return cc <= 1000 ? U.v1000 : cc <= 2000 ? U.v2000
         : cc <= 3000 ? U.v3000 : cc <= 3500 ? U.v3500 : U.v3500p;
  }

  /* ══════════════ КАЗАХСТАН ═══════════════════════════════════════
     Отличия от России, каждое — отдельная норма:
     · таможенная база задаётся ТРЕМЯ способами (сетка / вручную /
       инвойс+фрахт) — baseUsd передаётся уже выбранным;
     · утилизационный платёж зависит от объёма И МАРШРУТА ввоза
       (прямой из Кореи против ввоза из РФ/РБ) — коэффициенты кратно
       разные, перенос логики РФ даёт неверную цифру всегда;
     · регистрационный сбор — своя шкала по возрасту;
     · акциз на роскошь 10% при стоимости от 18 000 МРП начисляется и
       физлицу тоже (решение владельца Р-1, подтверждено ст. 535 п. 2
       подп. 2 НК РК);
     · второй автомобиль за 12 месяцев ПЕРЕКВАЛИФИЦИРУЕТСЯ в товар не
       для личного пользования — расчёт уходит на коммерческий контур. */
  function calcKZ(i, R) {
    var fx = +i.fx || 0, fxe = +i.fxe || 0, fxk = +i.fxk || 0;
    var cc = +i.cc || 0, fracht = +i.fracht || 0;
    var mk = 1 + ((+i.fxAdd || 0) / 100);
    var buy0 = i.cur === 'krw' ? (+i.buyKrw || 0) * fxk / 100 : (+i.buy || 0) * fx;
    var buy = fx > 0 ? buy0 / fx : 0;
    var broker = +i.broker || 0, sbkts = +i.sbkts || 0, srts = +i.srts || 0, retail = +i.retail || 0;
    var a = ageYears(i.declISO, i.year, i.month, i.monthConfirmed !== false);
    var band = bandOf(a);

    var requal = (i.personal !== false) && i.importedLastYear === 'yes';
    var pers = (i.personal !== false) && !requal;

    var baseUSD = i.baseUsd != null ? (+i.baseUsd || 0) : (buy + fracht);
    var TS = baseUSD * fx;

    var MRP = R.kz.mrp.value;
    var duty = 0, dmode = '', excise = 0, exMode = '', vat = 0;
    if (pers) {
      var d = dutyPersonal(R, cc, band, TS, fxe);
      duty = d.v; dmode = d.m;
    } else {
      var e = dutyEtt(R, cc, a, TS, fxe);
      duty = e.v; dmode = e.m;
      if (cc > R.kz.exciseVolume.ccOver) {
        excise = cc * R.kz.exciseVolume.rate;
        exMode = R.kz.exciseVolume.rate + ' ₸/см³ (V>3,0 л)';
      }
    }
    if (R.kz.luxRate.appliesToIndividual !== false && TS >= R.kz.luxMrp.value * MRP) {
      excise += TS * R.kz.luxRate.value;
      exMode = (exMode ? exMode + ' + ' : '') + (R.kz.luxRate.value * 100) + '% роскошь';
    }
    if (!pers) vat = (TS + duty + excise) * R.kz.vat.value;

    var isEv = i.fuel === 'ev';
    var route = i.route || 'direct';
    var kU = isEv ? R.kz.utilKEv[route] : utilK(R, cc, route);
    var UTIL_BASE = R.kz.utilBaseMrp.value * MRP;
    var util = UTIL_BASE * kU;
    var reg = isEv ? regFeeEv(R, a, MRP) : regFee(R, a, MRP);
    var SBOR = R.kz.sborMrp.value * MRP;

    var gov = duty + excise + vat + SBOR + util + reg;
    var fr0 = fracht * fx;
    var buyKZT = buy0 * mk, frKZT = fr0 * mk;
    var fxPad = (buyKZT - buy0) + (frKZT - fr0);
    var full = buyKZT + frKZT + gov + broker + sbkts + srts;
    var profit = retail > 0 ? retail - full : null;
    var pct = (profit !== null && full) ? profit / full * 100 : null;

    return {
      country: 'KZ', currency: 'KZT',
      age: a, band: band, bandName: bandName(band),
      personal: pers, requalified: requal,
      baseUsd: baseUSD, priceLocal: buy0, freight: fr0, customsValue: TS,
      fxMarkup: fxPad, priceWithMarkup: buyKZT, freightWithMarkup: frKZT,
      duty: duty, dutyMode: dmode, excise: excise, exciseMode: exMode, vat: vat,
      fee: SBOR, util: util, utilK: kU, regFee: reg,
      gov: gov, total: full, profit: profit, profitPct: pct,
    };
  }

  function utilK(R, cc, rt) {
    var t = R.kz.utilK.table[rt];
    return cc <= 1000 ? t[1000] : cc <= 2000 ? t[2000] : cc <= 3000 ? t[3000] : t[9999];
  }
  /* Возраст для регистрационного сбора считается ОТ ДАТЫ ПРОИЗВОДСТВА
     (решение владельца П-2 от 03.09.2026), несмотря на формулировку
     «включая год выпуска» в ст. 615 п. 4 НК РК. Расхождение с текстом
     нормы зафиксировано и разрешается квитанцией первой сделки. */
  function regFee(R, ageY, MRP) {
    var G = R.kz.regFee, t = G[G.version] || G.st615;
    for (var i = 0; i < t.length; i++) if (ageY < t[i][0]) return t[i][1] * MRP;
    return t[t.length - 1][1] * MRP;
  }
  function regFeeEv(R, ageY, MRP) {
    var t = R.kz.regFeeEv.table;
    for (var i = 0; i < t.length; i++) if (ageY < t[i][0]) return t[i][1] * MRP;
    return t[t.length - 1][1] * MRP;
  }

  /* ══════════════ БЕЛАРУСЬ ════════════════════════════════════════
     Отличия: акциза на легковые НЕТ вообще (три официальных источника),
     поэтому база НДС юрлица короче российской на строку — ТС + пошлина.
     Утильсбор зависит от типа двигателя, ОБЪЁМА, статуса получателя и
     возраста (ПП Совмина РБ № 195); мощность в кВт применяется только к
     самоходным машинам и к легковым отношения не имеет.
     Льгота № 140 — минус 50% пошлины, только физлицу и только ДВС. */
  function calcBY(i, R) {
    var usd = +i.usd || 0, eur = +i.eur || 0, krw = +i.krw || 0;
    var cc = +i.cc || 0, log = +i.log || 0;
    var mk = 1 + ((+i.fxAdd || 0) / 100);
    var buyB0 = i.cur === 'krw' ? (+i.buyKrw || 0) * krw / 1000 : (+i.buy || 0) * usd;
    var sbkts = +i.sbkts || 0, era = +i.era || 0, brk = +i.brk || 0;
    var rflog = +i.rflog || 0, retail = +i.retail || 0;
    var a = ageYears(i.declISO, i.year, i.month, i.monthConfirmed !== false);
    var band = bandOf(a), lt3 = a < 3;
    var pers = i.personal !== false, ev = i.fuel === 'ev';

    var log0 = log * usd, TS = buyB0 + log0;
    var buyB = buyB0 * mk, logB = log0 * mk;
    var fxPad = (buyB - buyB0) + (logB - log0);

    var duty = 0, dmode = '', vat = 0, lgSave = 0;
    if (pers) {
      if (ev) { duty = 0; dmode = 'электро — 0% (квота)'; }
      else {
        var d = dutyPersonal(R, cc, band, TS, eur);
        duty = d.v; dmode = d.m;
      }
      if (i.privilege === 'yes' && i.fuel === 'ice') { lgSave = duty * 0.5; duty -= lgSave; }
    } else {
      if (ev) { duty = TS * 0.15; dmode = '15% (электро, юрлицо)'; }
      else { var e = dutyEtt(R, cc, a, TS, eur); duty = e.v; dmode = e.m; }
      vat = (TS + duty) * R.by.vat.value;
    }

    var UTIL_PERS = R.by.utilPers.table;
    var util = pers ? (lt3 ? UTIL_PERS.lt3 : UTIL_PERS.ge3) : utilOrg(R, cc, ev, lt3);
    var SBOR = R.by.sbor.value, REGFEE = R.by.regFee.value;
    var gov = duty + vat + SBOR + util + REGFEE;
    var full = buyB + logB + gov + sbkts + era + brk + rflog;
    var profit = retail > 0 ? retail - full : null;
    var pct = (profit !== null && full) ? profit / full * 100 : null;

    return {
      country: 'BY', currency: 'BYN',
      age: a, band: band, bandName: bandName(band), personal: pers,
      priceLocal: buyB0, freight: log0, customsValue: TS,
      fxMarkup: fxPad, priceWithMarkup: buyB, freightWithMarkup: logB,
      duty: duty, dutyMode: dmode, privilegeSaved: lgSave,
      excise: 0, vat: vat, fee: SBOR, util: util, regFee: REGFEE,
      gov: gov, total: full, profit: profit, profitPct: pct,
    };
  }

  function utilOrg(R, cc, ev, lt3) {
    var T = R.by.utilOrg.table;
    if (ev) return lt3 ? T[0][1] : T[0][2];
    for (var i = 1; i < T.length; i++) {
      if (cc <= T[i][0] || T[i][0] === Infinity) return lt3 ? T[i][1] : T[i][2];
    }
    return lt3 ? T[5][1] : T[5][2];
  }

  var API = {
    version: '1.0',
    calcRU: calcRU, calcKZ: calcKZ, calcBY: calcBY,
    /* вспомогательное — нужно и интерфейсу, и публикатору */
    madeMoment: madeMoment, declDate: declDate, ageYears: ageYears,
    bandOf: bandOf, bandName: bandName,
    dutyRate: dutyRate, ettMin: ettMin, dutyPersonal: dutyPersonal, dutyEtt: dutyEtt,
    feeScale: feeScale, powIdx: powIdx, powIdxEv: powIdxEv, grpFor: grpFor,
    utilK: utilK, regFee: regFee, regFeeEv: regFeeEv, utilOrg: utilOrg,
  };
  root.ENCAR_CALC = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
