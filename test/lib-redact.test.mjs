// 個資不進 observation（transform/normalize/_lib.mjs 的 redactPersonal）。
// repo 是公開的，「政府名冊上查得到」跟「打包成 git repo 公開」不是同一件事。
import test from 'node:test';
import assert from 'node:assert/strict';
import { redactPersonal } from '../transform/normalize/_lib.mjs';

const phone = (v) => redactPersonal({ phone: v }).phone;
const text = (v) => redactPersonal({ description: v }).description;

test('09xx 手機不留，市話留著', () => {
  assert.equal(phone('0900-000-001'), undefined);
  assert.equal(phone('886900000002'), undefined);
  assert.equal(phone('02-2345-6789'), '02-2345-6789');
  assert.equal(phone('049-2222222'), '049-2222222', '南投 049 開頭不是手機');
  assert.equal(phone('087330924'), '087330924', '屏東 08 開頭，中間有 09 不算');
});

test('一格塞市話又塞手機：挖掉手機留市話', () => {
  assert.equal(phone('06-2098999#241、0900000003'), '06-2098999#241');
  assert.equal(phone('(02)24223522或0900000004'), '(02)24223522');
  assert.equal(phone('06-6801917、0900-000-005'), '06-6801917');
  assert.equal(phone('06-5050905#8101、8102'), '06-5050905#8101、8102', '# 是分機不是手機');
});

test('證照號碼與到期日整個不寫', () => {
  const out = redactPersonal({ name: '某人', licenseNo: '11120017', licenseExpiresAt: '2027-01-01' });
  assert.deepEqual(out, { name: '某人' });
});

test('免費信箱不留，機構信箱留著', () => {
  assert.equal(redactPersonal({ email: 'a@gmail.com' }).email, undefined);
  assert.equal(redactPersonal({ email: 'b@msa.hinet.net' }).email, undefined);
  assert.equal(redactPersonal({ email: 'service@npm.gov.tw' }).email, 'service@npm.gov.tw');
});

test('自由文字裡的手機要挖掉，公文字號不能動', () => {
  // 兩者長得一模一樣，差別只在前後文
  assert.equal(text('聯絡人:陳小姐0900000006，承辦:蔡先生0900000007。'), '聯絡人:陳小姐，承辦:蔡先生。');
  assert.equal(text('敬請電洽呂主委：0900-000-008'), '敬請電洽呂主委：');
  assert.equal(text('11月17日新北府文資字第10921798772號公告'), '11月17日新北府文資字第10921798772號公告');
  assert.equal(text('臺內民字第0920062231號文'), '臺內民字第0920062231號文');
  assert.equal(text('屏府文資字第0960154298 號'), '屏府文資字第0960154298 號');
});

test('網址裡的數字串不能被當成手機砍掉', () => {
  assert.equal(text('https://www.opentix.life/event/200920630835579699'),
    'https://www.opentix.life/event/200920630835579699');
  assert.equal(redactPersonal({ sourceUrl: 'https://x.tw/a/0912345678' }).sourceUrl,
    'https://x.tw/a/0912345678', 'url 結尾的欄位整個跳過');
});

test('巢狀結構也要走一遍', () => {
  const out = redactPersonal({
    title: '講座', sessions: [{ venueNameRaw: '某館', description: '洽詢 0912-345-678' }],
  });
  assert.equal(out.sessions[0].description, '洽詢');
  assert.equal(out.sessions[0].venueNameRaw, '某館');
});

test('整格只剩空白就不留空字串', () => {
  assert.equal(redactPersonal({ theme: '0900-000-009' }).theme, undefined);
  assert.ok(!('theme' in redactPersonal({ theme: '0900-000-009' })));
});
