/*
 * mobile.js — 再エネ打 スマホ版（ひらがなフリック入力プロトタイプ）
 *
 * PC版（game.js）はローマ字を keydown で1打ずつ拾うが、スマホには物理キーがない。
 * こちらは「OSの日本語かなキーボード（フリック）で未確定ひらがなを打ってもらい、
 * それをお題の読み（ひらがな）と前方一致で照合する」方式。
 *
 * ★肝（実機テストで確認したい所）
 *   - IMEの composition 挙動。特に iOS Safari は compositionupdate / value の出方にクセがある。
 *   - 1単語クリア後に input.value="" で未確定状態がちゃんと消えるか（消えないと2単語目以降が壊れる）。
 *
 * 単語データ(Words)と効果音(Sound)はPC版とそのまま共有している。
 */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  // ---- かな正規化：カタカナ→ひらがな、かな・長音符以外（空白/英字/予測変換のゴミ等）は捨てる
  function normalizeKana(s) {
    if (!s) return "";
    let out = "";
    for (const ch of s) {
      let c = ch.codePointAt(0);
      // カタカナ(ァ..ヶ) → ひらがな
      if (c >= 0x30a1 && c <= 0x30f6) c -= 0x60;
      const keep =
        (c >= 0x3041 && c <= 0x3096) || // ひらがな
        c === 0x30fc || // 長音符 ー
        c === 0x309d || c === 0x309e; // ゝ ゞ
      if (keep) out += String.fromCodePoint(c);
    }
    return out;
  }

  function commonPrefixLen(a, b) {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a[i] === b[i]) i++;
    return i;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // モバイル用の1単語あたり制限時間（ms）。フリックは遅いのでPC版より大幅に余裕を持たせ、
  // コース speed の効きも弱める。
  function durationFor(kanaCount, courseSpeed) {
    const speedFactor = 1 + (courseSpeed - 1) * 0.4;
    return (3200 + kanaCount * 1200) / speedFactor;
  }

  function rankOf(kps) {
    if (kps >= 2.2) return { title: "グリッドマイスター", icon: "👑", msg: "親指が発電機！伝説級のフリック。" };
    if (kps >= 1.6) return { title: "再エネエキスパート", icon: "🏆", msg: "片手でこの速さは見事。" };
    if (kps >= 1.1) return { title: "ベテラン技士", icon: "🥇", msg: "安定したフリック。頼れる打ち手。" };
    if (kps >= 0.7) return { title: "一人前の送電マン", icon: "🥈", msg: "実戦OK。次は正確さも。" };
    if (kps >= 0.4) return { title: "かけだし発電士", icon: "🥉", msg: "基礎はOK。練習あるのみ！" };
    return { title: "みならい", icon: "🔰", msg: "あわてず一文字ずつ。" };
  }

  const Game = {
    course: null,
    queue: [],
    word: null, // { reading }
    entry: null,
    qIndex: 0,
    duration: 0,
    wordStart: 0,
    gameStart: 0,
    raf: 0,
    countingDown: false,
    playing: false,
    screen: "start",
    lastBuf: "",
    consumed: 0, // 入力欄の値のうち、クリア済み単語が消化した「かな文字数」
    composing: false, // IME変換（未確定）中か
    stats: null,
    input: null,

    init() {
      this.input = $("#kana-input");

      document.querySelectorAll("[data-course]").forEach((btn) => {
        btn.addEventListener("click", () => {
          Sound.unlock();
          this.start(btn.getAttribute("data-course"));
        });
      });

      const soundBtn = $("#sound-toggle");
      const syncSound = () => {
        soundBtn.textContent = Sound.isEnabled() ? "🔊 音あり" : "🔇 音なし";
        soundBtn.setAttribute("aria-pressed", String(Sound.isEnabled()));
      };
      soundBtn.addEventListener("click", () => {
        Sound.setEnabled(!Sound.isEnabled());
        syncSound();
      });
      syncSound();

      $("#again").addEventListener("click", () => this.start(this.course.key));
      $("#to-menu").addEventListener("click", () => this.show("start"));
      $("#quit").addEventListener("click", () => this.abort());

      // 入力欄にフォーカスを取り戻すボタン（キーボードが閉じたとき用）
      $("#focus-btn").addEventListener("click", () => this.focusInput());

      // ゲーム画面の上半分をタップしてもキーボードを呼べるように
      $("#tap-to-type").addEventListener("click", () => this.focusInput());

      // --- 入力イベント
      // iOS対策：照合は常に input.value を読む（value は触らない）。クリアは確定後だけ安全に行う。
      this.input.addEventListener("compositionstart", () => {
        this.composing = true;
      });
      this.input.addEventListener("compositionend", () => {
        this.composing = false;
        this.handleBuffer();
        this.safeReset();
      });
      this.input.addEventListener("input", () => this.handleBuffer());

      // デバッグ用：入力欄の生の値とオフセットを画面に出す
      const dbg = $("#debug-raw");
      this.input.addEventListener("input", () => {
        const full = normalizeKana(this.input.value);
        dbg.textContent = "値「" + this.input.value + "」→ かな「" + full + "」消化:" + this.consumed;
      });

      this.show("start");
    },

    show(name) {
      ["start", "game", "result"].forEach((s) => {
        $("#screen-" + s).classList.toggle("active", s === name);
      });
      this.screen = name;
      if (name !== "game") {
        this.playing = false;
        cancelAnimationFrame(this.raf);
        this.input.blur();
      }
    },

    focusInput() {
      // iOS はユーザー操作起点でないと keyboard が出ない。クリックハンドラ内から呼ぶこと。
      this.input.focus();
    },

    // 入力欄を完全に初期化（ゲーム開始時など、安全なタイミングだけ呼ぶ）
    clearAll() {
      this.lastBuf = "";
      this.consumed = 0;
      this.input.value = "";
    },

    // iOSはフォーカス中に value を書き換えるとフォーカスが外れ、再タップが必要になる。
    // そのため value を消すのは「変換が確定して未確定文字が無い瞬間」だけにする。
    // 変換中はクリアせず、消化済みオフセット(consumed)で読み飛ばして照合を続ける。
    safeReset() {
      if (!this.composing) this.clearAll();
    },

    start(courseKey) {
      const conf = Words.COURSES[courseKey];
      this.course = Object.assign({ key: courseKey }, conf);
      this.queue = shuffle(conf.pool).slice(0, conf.count);
      this.qIndex = 0;
      this.stats = { correctKana: 0, missKana: 0, wordsDone: 0, wordsMissed: 0 };
      this.word = null;
      this.entry = null;

      $("#hud-course").textContent = conf.name;
      $("#hud-total").textContent = conf.count;
      this.updateHud();

      this.show("game");
      this.composing = false;
      this.clearAll();
      this.focusInput();

      this.countdown(() => {
        this.gameStart = performance.now();
        this.playing = true;
        this.nextWord();
      });
    },

    countdown(done) {
      this.countingDown = true;
      const el = $("#countdown");
      el.classList.add("show");
      let n = 3;
      const tick = () => {
        if (this.screen !== "game") {
          el.classList.remove("show");
          return;
        }
        if (n > 0) {
          el.textContent = String(n);
          el.classList.remove("pop");
          void el.offsetWidth;
          el.classList.add("pop");
          n -= 1;
          setTimeout(tick, 750);
        } else {
          el.textContent = "START!";
          el.classList.add("pop");
          setTimeout(() => {
            el.classList.remove("show", "pop");
            this.countingDown = false;
            done();
          }, 550);
        }
      };
      tick();
    },

    nextWord() {
      cancelAnimationFrame(this.raf);
      this.lastBuf = ""; // 入力欄(value)は消さない。クリアは safeReset 任せ
      if (this.qIndex >= this.queue.length) {
        this.finish();
        return;
      }
      const entry = this.queue[this.qIndex];
      this.qIndex += 1;
      this.entry = entry;
      this.word = { reading: normalizeKana(entry.reading) };
      this.duration = durationFor(this.word.reading.length, this.course.speed);
      this.wordStart = performance.now();

      const plate = $("#plate");
      plate.classList.remove("eaten");
      $("#plate-icon").textContent = entry.icon;
      $("#plate-label").textContent = entry.label;

      this.renderProgress(0, false);
      this.updateHud();
      this.loop();
    },

    renderProgress(doneLen, missFlash) {
      const target = this.word.reading;
      $("#reading").innerHTML =
        '<span class="done">' + esc(target.slice(0, doneLen)) + "</span>" +
        '<span class="todo">' + esc(target.slice(doneLen)) + "</span>";
      if (missFlash) {
        const r = $("#reading");
        r.classList.remove("miss");
        void r.offsetWidth;
        r.classList.add("miss");
      }
    },

    // 入力欄の値を読み、消化済みオフセットの先だけをお題と照合
    handleBuffer() {
      if (!this.playing || !this.word) return;
      const full = normalizeKana(this.input.value);
      const buf = full.slice(this.consumed); // 今のお題ぶんの入力
      if (buf === this.lastBuf) return;
      const grew = buf.length > this.lastBuf.length;
      this.lastBuf = buf;

      const target = this.word.reading;
      if (target.startsWith(buf)) {
        if (buf.length > 0) Sound.type();
        this.renderProgress(buf.length, false);
        this.updateHud();
        if (buf === target) this.completeWord();
      } else {
        const lcp = commonPrefixLen(buf, target);
        this.renderProgress(lcp, true);
        if (grew) {
          this.stats.missKana += 1;
          Sound.miss();
          this.updateHud();
        }
      }
    },

    loop() {
      const step = () => {
        if (this.screen !== "game" || !this.playing) return;
        const elapsed = performance.now() - this.wordStart;
        const p = Math.min(1, elapsed / this.duration);
        $("#plate").style.left = 86 - 80 * p + "%";
        $("#timebar-fill").style.width = 100 - p * 100 + "%";
        $("#timebar-fill").classList.toggle("danger", p > 0.7);
        if (p >= 1) {
          this.timeout();
          return;
        }
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    },

    timeout() {
      cancelAnimationFrame(this.raf);
      // 取り逃した単語に途中まで打った文字が、次の単語へ持ち越されないよう消化済みにする
      this.consumed = normalizeKana(this.input.value).length;
      this.safeReset();
      this.stats.wordsMissed += 1;
      Sound.miss();
      this.nextWord();
    },

    completeWord() {
      cancelAnimationFrame(this.raf);
      this.consumed += this.word.reading.length; // この単語ぶんを消化済みに
      this.stats.wordsDone += 1;
      this.stats.correctKana += this.word.reading.length;
      Sound.word();

      const plate = $("#plate");
      const gain = this.word.reading.length * 60 + 150;
      const pop = $("#gain-pop");
      pop.textContent = "+" + gain.toLocaleString() + " kWh";
      pop.style.left = plate.style.left;
      pop.classList.remove("show");
      void pop.offsetWidth;
      pop.classList.add("show");
      plate.classList.add("eaten");

      this.updateHud();
      setTimeout(() => this.nextWord(), 160);
    },

    updateHud() {
      $("#hud-index").textContent = Math.min(this.qIndex, this.course.count);
      $("#hud-power").textContent = this.earnedPower().toLocaleString();
      $("#hud-done").textContent = this.stats.wordsDone;
      $("#hud-miss").textContent = this.stats.wordsMissed;
    },

    earnedPower() {
      return this.stats.correctKana * 60 + this.stats.wordsDone * 150;
    },

    abort() {
      cancelAnimationFrame(this.raf);
      this.show("start");
    },

    finish() {
      cancelAnimationFrame(this.raf);
      this.playing = false;
      this.input.blur();
      const elapsedSec = Math.max(0.001, (performance.now() - this.gameStart) / 1000);
      const s = this.stats;
      const kps = s.correctKana / elapsedSec;
      const totalKana = s.correctKana + s.missKana;
      const accuracy = totalKana === 0 ? 0 : (s.correctKana / totalKana) * 100;
      const earned = this.earnedPower();
      const target = this.course.power;
      const diff = earned - target;
      const rank = rankOf(kps);
      const co2 = (earned * 0.0004).toFixed(2);

      $("#r-power").textContent = earned.toLocaleString() + " kWh";
      $("#r-target").textContent = target.toLocaleString() + " kWh";
      const bal = $("#r-balance");
      if (diff >= 0) {
        bal.textContent = "黒字！ +" + diff.toLocaleString() + " kWh ⚡";
        bal.className = "balance plus";
      } else {
        bal.textContent = "赤字… " + diff.toLocaleString() + " kWh";
        bal.className = "balance minus";
      }
      $("#r-co2").textContent = co2 + " t-CO₂";
      $("#r-done").textContent = s.wordsDone + " / " + this.course.count;
      $("#r-missed").textContent = s.wordsMissed + " 問";
      $("#r-correct").textContent = s.correctKana + " 文字";
      $("#r-misskey").textContent = s.missKana + " 回";
      $("#r-acc").textContent = accuracy.toFixed(1) + " %";
      $("#r-kps").textContent = kps.toFixed(2) + " 字/秒";
      $("#r-time").textContent = elapsedSec.toFixed(1) + " 秒";

      $("#r-rank-icon").textContent = rank.icon;
      $("#r-rank-title").textContent = rank.title;
      let msg = rank.msg;
      if (s.wordsMissed === 0 && s.missKana === 0) msg = "パーフェクト送電！🌟";
      $("#r-rank-msg").textContent = msg;

      Sound.finish();
      this.show("result");
    },
  };

  function esc(str) {
    return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  document.addEventListener("DOMContentLoaded", () => Game.init());
})();
