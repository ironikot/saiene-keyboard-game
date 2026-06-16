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

  // スマホ版だけのコース表示名の上書き（PC版＝words.jsのnameは変えない）
  const MOBILE_LABELS = { normal: "中級コース" };

  // エンドレス（持ち時間制）のスマホ用パラメータ。フリックは遅いのでPC版より緩め。
  // 回復は「かな1文字あたり」。回復 < 消費 になるよう渋めにして、上手いほど延命する設計。
  const ENDLESS_START_MS = 30000; // 開始時の持ち時間（30秒）
  const ENDLESS_CAP_MS = 45000; // 持ち時間の上限（45秒）
  const ENDLESS_TIMEBAR_FULL = 30000; // バーが満タン表示になる持ち時間
  // 回復はフリック最速（およそ0.3秒/かな）より十分小さくして、上手い人でも必ず目減りさせる。
  const TIME_PER_KANA = 130; // ミスありクリア: かな1文字 +0.13秒
  const TIME_PER_KANA_PERFECT = 230; // ノーミスクリア: かな1文字 +0.23秒

  const Game = {
    course: null,
    queue: [],
    word: null, // { reading }
    entry: null,
    qIndex: 0,
    duration: 0,
    wordStart: 0,
    gameStart: 0,
    endless: false,
    timeLeft: 0, // エンドレスの残り持ち時間（ms）
    lastTick: 0,
    wordPerfect: true, // いまの単語をノーミスで打てているか
    raf: 0,
    countingDown: false,
    playing: false,
    screen: "start",
    lastBuf: "",
    consumed: 0, // 入力欄の値のうち、クリア済み単語が消化した「かな文字数」
    composing: false, // IME変換（未確定）中か
    stats: null,
    inputA: null,
    inputB: null,
    activeInput: null, // いま打ち込んでいる方の入力欄

    init() {
      this.inputA = $("#kana-input");
      this.inputB = $("#kana-input2");
      this.activeInput = this.inputA;

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

      // --- 入力イベント（2つの入力欄どちらにも付け、アクティブな方だけ処理する）
      const dbg = $("#debug-raw");
      [this.inputA, this.inputB].forEach((el) => {
        el.addEventListener("compositionstart", (e) => {
          if (e.target === this.activeInput) this.composing = true;
        });
        el.addEventListener("compositionend", (e) => {
          if (e.target !== this.activeInput) return; // スワップで外れた古い欄の確定は無視
          this.composing = false;
          this.handleBuffer();
        });
        el.addEventListener("input", (e) => {
          if (e.target !== this.activeInput) return;
          this.handleBuffer();
          const full = normalizeKana(this.activeInput.value);
          dbg.textContent = "値「" + this.activeInput.value + "」→ かな「" + full + "」消化:" + this.consumed;
        });
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
        this.blurInputs();
      }
    },

    blurInputs() {
      this.inputA.blur();
      this.inputB.blur();
    },

    focusInput() {
      // iOS はユーザー操作起点でないと keyboard が出ない。クリックハンドラ内から呼ぶこと。
      this.activeInput.focus();
    },

    // 入力欄を完全に初期化（ゲーム開始時など）
    clearAll() {
      this.lastBuf = "";
      this.consumed = 0;
      this.composing = false;
      this.inputA.value = "";
      this.inputB.value = "";
      this.activeInput = this.inputA;
      this.inputA.classList.add("active");
      this.inputB.classList.remove("active");
    },

    // 1単語ぶん打ち終えた／取り逃した時のクリア。
    // iOSは value を消すとフォーカスが外れて再タップが要るが、
    // 「もう片方のテキスト欄へフォーカスを移す」とキーボードを開いたまま
    // 前の欄の変換が確定する。Enter不要・再タップ不要で自動クリアできる。
    swapClear() {
      const cur = this.activeInput;
      const other = cur === this.inputA ? this.inputB : this.inputA;
      other.value = "";
      other.classList.add("active");
      cur.classList.remove("active");
      other.focus(); // ← フォーカス移動で cur の変換確定＋キーボード維持
      cur.value = "";
      this.activeInput = other;
      this.consumed = 0;
      this.lastBuf = "";
      this.composing = false;
    },

    start(courseKey) {
      const conf = Words.COURSES[courseKey];
      this.course = Object.assign({ key: courseKey }, conf);
      this.queue = shuffle(conf.pool).slice(0, conf.count);
      this.qIndex = 0;
      this.stats = { correctKana: 0, missKana: 0, wordsDone: 0, wordsMissed: 0 };
      this.word = null;
      this.entry = null;
      this.endless = !!conf.endless;
      this.timeLeft = this.endless ? ENDLESS_START_MS : 0;
      this.wordPerfect = true;

      $("#hud-course").textContent = MOBILE_LABELS[courseKey] || conf.name;
      $("#hud-total").textContent = this.endless ? "∞" : conf.count;
      $("#hud-time-box").hidden = !this.endless;
      if (this.endless) this.renderTime();
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
      this.lastBuf = ""; // クリアは completeWord/timeout の swapClear が担当
      if (this.qIndex >= this.queue.length) {
        if (this.endless) {
          this.queue = this.queue.concat(shuffle(this.course.pool)); // お題を補充して続行
        } else {
          this.finish();
          return;
        }
      }
      const entry = this.queue[this.qIndex];
      this.qIndex += 1;
      this.entry = entry;
      this.word = { reading: normalizeKana(entry.reading) };
      this.duration = durationFor(this.word.reading.length, this.course.speed);
      this.wordStart = performance.now();
      this.wordPerfect = true;

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
      const full = normalizeKana(this.activeInput.value);
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
          this.wordPerfect = false;
          Sound.miss();
          this.updateHud();
        }
      }
    },

    loop() {
      this.lastTick = performance.now();
      const step = () => {
        if (this.screen !== "game" || !this.playing) return;
        const now = performance.now();
        const dt = Math.min(100, now - this.lastTick); // タブ非表示明けの一気減算を防ぐ
        this.lastTick = now;

        const elapsed = now - this.wordStart;
        const p = Math.min(1, elapsed / this.duration);
        $("#plate").style.left = 86 - 80 * p + "%";

        if (this.endless) {
          // 全体の持ち時間を減らす（バー・数字は持ち時間を表示）
          this.timeLeft -= dt;
          if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.renderTime();
            this.finish();
            return;
          }
          this.renderTime();
        } else {
          // 通常コースは単語ごとの残り時間バー
          $("#timebar-fill").style.width = 100 - p * 100 + "%";
          $("#timebar-fill").classList.toggle("danger", p > 0.7);
        }

        if (p >= 1) {
          this.timeout();
          return;
        }
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    },

    renderTime() {
      $("#hud-time").textContent = (this.timeLeft / 1000).toFixed(1);
      const pct = Math.min(1, this.timeLeft / ENDLESS_TIMEBAR_FULL);
      $("#timebar-fill").style.width = pct * 100 + "%";
      $("#timebar-fill").classList.toggle("danger", this.timeLeft < 10000);
    },

    timeout() {
      cancelAnimationFrame(this.raf);
      this.swapClear(); // 打ちかけを片付けて次へ（持ち越さない）
      this.stats.wordsMissed += 1;
      Sound.miss();
      this.nextWord();
    },

    completeWord() {
      cancelAnimationFrame(this.raf);
      this.swapClear(); // 入力欄を自動クリア（Enter・再タップ不要）
      const n = this.word.reading.length;
      this.stats.wordsDone += 1;
      this.stats.correctKana += n;
      Sound.word();

      // エンドレス: クリアで持ち時間を回復（かな長に比例。ノーミスなら多め）
      if (this.endless) {
        const tGain = n * (this.wordPerfect ? TIME_PER_KANA_PERFECT : TIME_PER_KANA);
        this.timeLeft = Math.min(this.timeLeft + tGain, ENDLESS_CAP_MS);
        this.renderTime();
        const tg = $("#time-gain");
        tg.textContent = "+" + (tGain / 1000).toFixed(1) + "秒" + (this.wordPerfect ? " ✨" : "");
        tg.style.left = $("#plate").style.left;
        tg.classList.remove("show");
        void tg.offsetWidth;
        tg.classList.add("show");
      }

      const plate = $("#plate");
      const gain = n * 60 + 150;
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
      $("#hud-index").textContent = this.endless ? this.qIndex : Math.min(this.qIndex, this.course.count);
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
      this.blurInputs();
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
      $("#r-done").textContent = this.endless ? s.wordsDone + " 問" : s.wordsDone + " / " + this.course.count;
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
