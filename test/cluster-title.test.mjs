// test/cluster-title.test.mjs
// cluster.mjs 的純函式：標題／場館名正規化與 slug。
// 分群規則（match / buildClusters）正在被改，這裡不碰。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normTitle, normTitleVariants, titleSimilar, makeSlug, normVenue,
} from '../transform/cluster.mjs';

test('normTitle：三個實測案例', async (t) => {
  await t.test('分隔點的變體要收斂成同一個字串', () => {
    // 「．」(FF0E) 經 NFKC 之後是 ASCII 句點，漏了它就會漏掉這一組實測配對
    assert.equal(normTitle('大衛．吉塞森'), normTitle('大衛・吉塞森'));
    assert.equal(normTitle('大衛．吉塞森'), '大衛吉塞森');
    // 其餘變體：‧(2027)、·(00B7)、•(2022)
    assert.equal(normTitle('大衛‧吉塞森'), '大衛吉塞森');
    assert.equal(normTitle('大衛·吉塞森'), '大衛吉塞森');
  });

  await t.test('【系列名】預設剝掉，keepSeries 時留內容去符號', () => {
    const raw = '【2026台灣國際重唱藝術節】Gala Concert';
    assert.equal(normTitle(raw), 'galaconcert');
    assert.equal(normTitle(raw, { keepSeries: true }), '2026台灣國際重唱藝術節galaconcert');
  });

  await t.test('年份前綴只剝開頭，中間的年份留著', () => {
    assert.equal(normTitle('2026戲曲夢工場《灰燼×雲端×說書人》'), '戲曲夢工場灰燼×雲端×說書人');
    assert.equal(normTitle('114年度親子音樂會'), '親子音樂會');
    // 自編對照：年份不在開頭就是內容的一部分，不能剝
    assert.equal(normTitle('回顧2026'), '回顧2026');
  });

  await t.test('【】不只出現在開頭', () => {
    assert.equal(normTitle('TCO【名家系列】東西交響'), 'tco東西交響');
  });

  await t.test('書名號、引號只去符號留內容', () => {
    assert.equal(normTitle('《灰燼×雲端×說書人》'), '灰燼×雲端×說書人');
  });

  await t.test('空白、標點、大小寫都收斂', () => {
    assert.equal(normTitle('窩噗瘋一下！The WHOOP Group 臺北現場'), '窩噗瘋一下thewhoopgroup臺北現場');
  });

  await t.test('空值', () => {
    assert.equal(normTitle(null), '');
    assert.equal(normTitle(undefined), '');
    assert.equal(normTitle(''), '');
  });
});

test('normTitleVariants', async (t) => {
  await t.test('有【】時回兩種寫法：剝掉的在前、保留的在後', () => {
    assert.deepEqual(normTitleVariants('【2026台灣國際重唱藝術節】Gala Concert'),
      ['galaconcert', '2026台灣國際重唱藝術節galaconcert']);
  });
  await t.test('沒有【】時兩種寫法相同，只回一個', () => {
    assert.deepEqual(normTitleVariants('無括號標題'), ['無括號標題']);
  });
});

test('titleSimilar', async (t) => {
  await t.test('完全相同回 exact', () => {
    assert.equal(titleSimilar('灰燼×雲端×說書人', '灰燼×雲端×說書人'), 'exact');
  });
  await t.test('一方包含另一方回 contains', () => {
    assert.equal(titleSimilar(normTitle('《灰燼×雲端×說書人》'),
      normTitle('2026戲曲夢工場《灰燼×雲端×說書人》')), 'contains');
  });
  await t.test('較短的一方少於 4 個字就不接受包含關係', () => {
    // 「講座」包含在太多東西裡面
    assert.equal(titleSimilar('講座', '文化講座活動'), false);
  });
  await t.test('沒有交集回 false', () => {
    assert.equal(titleSimilar('abcdefg', 'hijklmn'), false);
  });
  await t.test('任一邊是空字串回 false', () => {
    assert.equal(titleSimilar('', 'abcdefg'), false);
    assert.equal(titleSimilar('abcdefg', ''), false);
  });
});

// cluster.mjs 的 titleSimilar docstring 舉了兩個「實測漏掉的配對」當作接受包含關係
// 的理由，但其中第一個多出來的那一段在字串**中間**，long.includes(short) 是 false，
// 多出來的那段在字串**中間**時 includes() 是 false，這種救不到。
// 這是刻意的取捨不是 bug——要救得做編輯距離，那會拉高誤併風險。
// 49 組 ground truth 裡有 3 組是這樣。這條測試守住「不要偷偷放寬」。
test('titleSimilar：多出來的段在中間時不算相似（刻意不支援）', () => {
  assert.equal(titleSimilar(normTitle('窩噗瘋一下！臺北現場'),
    normTitle('窩噗瘋一下！The WHOOP Group 臺北現場')), false);
  // 多的那段在開頭或結尾才救得到
  assert.equal(titleSimilar(normTitle('《灰燼×雲端×說書人》'),
    normTitle('2026戲曲夢工場《灰燼×雲端×說書人》')), 'contains');
});

test('makeSlug', async (t) => {
  await t.test('不可以產生含 # ? % 的檔名', () => {
    // Astro 的 glob loader 會在 # 處把檔名截斷，產生「檔案不存在」
    for (const raw of ['A#B?C%D&E', '100%純手作', '###', '什麼？#1 特展', 'a?b']) {
      const slug = makeSlug(raw);
      assert.ok(!/[#?%]/.test(slug), `${raw} → ${slug}`);
    }
  });
  await t.test('# ? % & 換成 -', () => {
    assert.equal(makeSlug('A#B?C%D&E'), 'A-B-C-D-E');
  });
  await t.test('括號類直接去掉，不變成 -', () => {
    assert.equal(makeSlug('《灰燼×雲端×說書人》'), '灰燼×雲端×說書人');
  });
  await t.test('斜線與空白換成 -，連續的收斂成一個', () => {
    assert.equal(makeSlug('臺北/藝術/節'), '臺北-藝術-節');
    assert.equal(makeSlug('  多重---空白  '), '多重-空白');
  });
  await t.test('年份前綴保留（slug 不做 normTitle 那套剝除）', () => {
    assert.equal(makeSlug('2026藝術節-SPIDERHORSE'), '2026藝術節-SPIDERHORSE');
  });
  await t.test('空值與只有符號的都回 untitled', () => {
    assert.equal(makeSlug(''), 'untitled');
    assert.equal(makeSlug(null), 'untitled');
    assert.equal(makeSlug(undefined), 'untitled');
    assert.equal(makeSlug('###'), 'untitled');
    assert.equal(makeSlug('   '), 'untitled');
  });
  await t.test('截到 80 字，且結尾不留 -', () => {
    assert.equal(makeSlug('x'.repeat(100)).length, 80);
    // 自編：第 81 個字元是分隔符時，截斷後不可以留尾巴的 -
    const s = makeSlug(`${'x'.repeat(80)} tail`);
    assert.equal(s, 'x'.repeat(80));
    assert.ok(!s.endsWith('-'));
  });
});

test('normVenue', async (t) => {
  await t.test('去掉 國立／市立／縣立／私立 前綴', () => {
    assert.equal(normVenue('國立臺灣戲曲中心'), normVenue('臺灣戲曲中心'));
    assert.equal(normVenue('市立美術館'), '美術館');
    assert.equal(normVenue('縣立文化中心'), '文化中心');
    assert.equal(normVenue('私立圖書館'), '圖書館');
  });
  await t.test('括號與連字號、空白都拿掉', () => {
    assert.equal(normVenue('市立美術館（南館）'), '美術館南館');
    assert.equal(normVenue('台北 - 中山堂'), '台北中山堂');
  });
  await t.test('英文轉小寫', () => {
    assert.equal(normVenue('Taipei Music Center'), 'taipeimusiccenter');
  });
  await t.test('空值回空字串', () => {
    assert.equal(normVenue(null), '');
    assert.equal(normVenue(undefined), '');
    assert.equal(normVenue(''), '');
  });
});
