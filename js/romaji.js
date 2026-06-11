/*
 * romaji.js — ローマ字入力エンジン
 *
 * 役割:
 *   ひらがな（カタカナ）の読みを「クラスタ」に分解し、各クラスタに対して
 *   受理可能なローマ字表記の一覧を持たせる。1打ごとに入力を判定して、
 *   正打 / ミス / 単語完了 を返す。
 *
 *   複数のローマ字表記を許容する（例: し = shi/si、じゃ = ja/jya/zya）。
 *   促音「っ」、撥音「ん」、長音「ー」にも対応する。
 *
 * 使い方:
 *   const w = new Romaji.Word("たいようこう");
 *   w.input("t") -> { ok: true, finished: false }
 *   w.guide()    -> { done: "...", todo: "..." }   表示用ガイド
 */
(function (global) {
  "use strict";

  // 母音
  const VOWELS = new Set(["a", "i", "u", "e", "o"]);

  // 単一かな -> ローマ字候補
  const SINGLE = {
    あ: ["a"], い: ["i"], う: ["u"], え: ["e"], お: ["o"],
    か: ["ka"], き: ["ki"], く: ["ku"], け: ["ke"], こ: ["ko"],
    が: ["ga"], ぎ: ["gi"], ぐ: ["gu"], げ: ["ge"], ご: ["go"],
    さ: ["sa"], し: ["shi", "si"], す: ["su"], せ: ["se"], そ: ["so"],
    ざ: ["za"], じ: ["ji", "zi"], ず: ["zu"], ぜ: ["ze"], ぞ: ["zo"],
    た: ["ta"], ち: ["chi", "ti"], つ: ["tsu", "tu"], て: ["te"], と: ["to"],
    だ: ["da"], ぢ: ["di", "ji"], づ: ["du", "zu"], で: ["de"], ど: ["do"],
    な: ["na"], に: ["ni"], ぬ: ["nu"], ね: ["ne"], の: ["no"],
    は: ["ha"], ひ: ["hi"], ふ: ["fu", "hu"], へ: ["he"], ほ: ["ho"],
    ば: ["ba"], び: ["bi"], ぶ: ["bu"], べ: ["be"], ぼ: ["bo"],
    ぱ: ["pa"], ぴ: ["pi"], ぷ: ["pu"], ぺ: ["pe"], ぽ: ["po"],
    ま: ["ma"], み: ["mi"], む: ["mu"], め: ["me"], も: ["mo"],
    や: ["ya"], ゆ: ["yu"], よ: ["yo"],
    ら: ["ra"], り: ["ri"], る: ["ru"], れ: ["re"], ろ: ["ro"],
    わ: ["wa"], ゐ: ["wi"], ゑ: ["we"], を: ["wo", "o"],
    ん: ["n", "nn", "xn", "n'"],
    ぁ: ["xa", "la"], ぃ: ["xi", "li"], ぅ: ["xu", "lu"], ぇ: ["xe", "le"], ぉ: ["xo", "lo"],
    ゃ: ["xya", "lya"], ゅ: ["xyu", "lyu"], ょ: ["xyo", "lyo"], っ: ["xtu", "ltu", "xtsu", "ltsu"],
    ゎ: ["xwa", "lwa"],
    ー: ["-"],
    "、": [","], "。": ["."], "・": ["/"],
  };

  // 2文字（拗音・外来音）-> ローマ字候補
  const COMBO = {
    きゃ: ["kya"], きゅ: ["kyu"], きょ: ["kyo"], きぇ: ["kye"],
    ぎゃ: ["gya"], ぎゅ: ["gyu"], ぎょ: ["gyo"],
    しゃ: ["sha", "sya"], しゅ: ["shu", "syu"], しょ: ["sho", "syo"], しぇ: ["she", "sye"],
    じゃ: ["ja", "jya", "zya"], じゅ: ["ju", "jyu", "zyu"], じょ: ["jo", "jyo", "zyo"], じぇ: ["je", "jye"],
    ちゃ: ["cha", "tya", "cya"], ちゅ: ["chu", "tyu", "cyu"], ちょ: ["cho", "tyo", "cyo"], ちぇ: ["che", "tye"],
    にゃ: ["nya"], にゅ: ["nyu"], にょ: ["nyo"],
    ひゃ: ["hya"], ひゅ: ["hyu"], ひょ: ["hyo"],
    びゃ: ["bya"], びゅ: ["byu"], びょ: ["byo"],
    ぴゃ: ["pya"], ぴゅ: ["pyu"], ぴょ: ["pyo"],
    みゃ: ["mya"], みゅ: ["myu"], みょ: ["myo"],
    りゃ: ["rya"], りゅ: ["ryu"], りょ: ["ryo"],
    ふぁ: ["fa"], ふぃ: ["fi"], ふぇ: ["fe"], ふぉ: ["fo"], ふゅ: ["fyu"],
    うぃ: ["wi"], うぇ: ["we"], うぉ: ["who"],
    ゔぁ: ["va"], ゔぃ: ["vi"], ゔ: ["vu"], ゔぇ: ["ve"], ゔぉ: ["vo"],
    てぃ: ["thi"], でぃ: ["dhi"], でゅ: ["dhu"], とぅ: ["twu"], どぅ: ["dwu"],
    つぁ: ["tsa"], つぃ: ["tsi"], つぇ: ["tse"], つぉ: ["tso"],
  };

  const SMALL = new Set(["ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ゃ", "ゅ", "ょ", "ゎ"]);

  // カタカナ -> ひらがな（長音符ー・中点はそのまま/除去）
  function toHiragana(str) {
    let out = "";
    for (const ch of str) {
      const code = ch.codePointAt(0);
      // カタカナブロック（ァ=0x30A1 .. ヶ=0x30F6）
      if (code >= 0x30a1 && code <= 0x30f6) {
        out += String.fromCodePoint(code - 0x60);
      } else if (ch === "ヴ") {
        out += "ゔ";
      } else if (ch === "・" || ch === "　" || ch === " ") {
        // 区切りは無視
        continue;
      } else {
        out += ch;
      }
    }
    return out;
  }

  // 促音つきの候補を生成する（次クラスタの先頭子音を重ねる + 明示形）
  function applySokuon(options) {
    const result = [];
    for (const opt of options) {
      const first = opt[0];
      if (!VOWELS.has(first) && first !== "n") {
        result.push(first + opt); // kka, ssa, tte ...
      }
    }
    // 明示的な小さい「っ」入力
    for (const opt of options) {
      result.push("xtu" + opt, "ltu" + opt, "xtsu" + opt, "ltsu" + opt);
    }
    // 重ね候補が無い場合（母音始まり等）でも明示形は残る
    if (result.length === 0) {
      for (const opt of options) result.push("xtu" + opt);
    }
    return result;
  }

  // 読みをクラスタ配列に分解する
  function tokenize(reading) {
    const kana = toHiragana(reading);
    const clusters = [];
    let i = 0;
    let sokuon = false;

    while (i < kana.length) {
      const ch = kana[i];

      if (ch === "っ") {
        sokuon = true;
        i += 1;
        continue;
      }

      let options;
      let consumed = 1;
      const next = kana[i + 1];

      if (next && SMALL.has(next) && COMBO[ch + next]) {
        options = COMBO[ch + next].slice();
        consumed = 2;
      } else if (SINGLE[ch]) {
        options = SINGLE[ch].slice();
      } else {
        // 未知文字はそのまま1打として扱う
        options = [ch];
      }

      if (sokuon) {
        options = applySokuon(options);
        sokuon = false;
      }

      clusters.push({ kana: kana.slice(i, i + consumed), options });
      i += consumed;
    }

    // 単語末尾に残った「っ」
    if (sokuon) {
      clusters.push({ kana: "っ", options: SINGLE["っ"].slice() });
    }

    return clusters;
  }

  function isPrefixOfLonger(buffer, options) {
    return options.some((o) => o.length > buffer.length && o.startsWith(buffer));
  }

  // 1単語ぶんの入力状態を管理する
  class Word {
    constructor(reading) {
      this.reading = reading;
      this.clusters = tokenize(reading);
      this.index = 0; // 現在処理中のクラスタ
      this.buffer = ""; // 現在クラスタへの入力途中
    }

    get finished() {
      return this.index >= this.clusters.length;
    }

    _current() {
      return this.clusters[this.index];
    }

    _advance() {
      this.index += 1;
      this.buffer = "";
    }

    // 1文字入力。{ ok, finished } を返す
    input(c) {
      if (this.finished) return { ok: false, finished: true };
      const cur = this._current();
      const candidate = this.buffer + c;
      const matches = cur.options.filter((o) => o.startsWith(candidate));

      if (matches.length > 0) {
        this.buffer = candidate;
        const isLast = this.index === this.clusters.length - 1;
        if (cur.options.includes(this.buffer) && (isLast || !isPrefixOfLonger(this.buffer, cur.options))) {
          this._advance();
        }
        return { ok: true, finished: this.finished };
      }

      // 現バッファが完成形なら、確定して次クラスタで再判定（例:「ん」=n の後に子音）
      if (cur.options.includes(this.buffer)) {
        this._advance();
        return this.input(c);
      }

      return { ok: false, finished: this.finished };
    }

    // 表示用ガイド（確定部分 / 未入力部分）
    guide() {
      let done = "";
      for (let i = 0; i < this.index; i++) {
        done += this.clusters[i].options[0];
      }
      let curTodo = "";
      if (this.index < this.clusters.length) {
        const cur = this._current();
        const opt = cur.options.find((o) => o.startsWith(this.buffer)) || cur.options[0];
        done += this.buffer;
        curTodo = opt.slice(this.buffer.length);
      }
      let todo = curTodo;
      for (let i = this.index + 1; i < this.clusters.length; i++) {
        todo += this.clusters[i].options[0];
      }
      return { done, todo };
    }

    // この単語を最短で打ち切るのに必要な総キー数（スコア用の目安）
    totalKeys() {
      return this.clusters.reduce((sum, c) => {
        const shortest = c.options.reduce((m, o) => Math.min(m, o.length), Infinity);
        return sum + shortest;
      }, 0);
    }
  }

  global.Romaji = { Word, tokenize, toHiragana };
})(window);
