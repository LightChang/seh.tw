// 指令列參數。scheduler 一 import 就會開始跑，可測的部分放這裡。

// `--force a b c`：旗標後面到下一個 `--` 開頭的參數為止都算它的值（以前只吃第一個，
// 其餘默默丟掉、不報錯）。旗標可以重複出現，值會合併。
export function flagValues(args, flag) {
  const out = new Set();
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== flag) continue;
    for (let j = i + 1; j < args.length && !args[j].startsWith('--'); j++) out.add(args[j]);
  }
  return out;
}
