/*
 * game.js — 再エネ打 ゲーム本体
 *
 * 寿司打を踏襲した「流れてくるお題をローマ字で打つ」タイピングゲーム。
 * コードはすべてオリジナル実装。お題だけ再エネ用語に差し替えてある。
 */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const VALID_KEY = /^[a-z0-9'\-,./]$/;

  // 1単語あたりの制限時間（ms）。コースが速いほど短くなる。
  function durationFor(totalKeys, speed) {
    return (1700 + totalKeys * 430) / speed;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function rankOf(kps) {
    if (kps >= 5.0) return { title: "グリッドマイスター", icon: "👑", msg: "全国の系統を支配する伝説の打ち手！" };
    if (kps >= 4.0) return { title: "再エネエキスパート", icon: "🏆", msg: "電力会社が放っておかない実力。" };
    if (kps >= 3.0) return { title: "ベテラン技士", icon: "🥇", msg: "安定した発電量。頼れる一人前。" };
    if (kps >= 2.0) return { title: "一人前の送電マン", icon: "🥈", msg: "実戦投入OK。次は3.0を狙おう。" };
    if (kps >= 1.0) return { title: "かけだし発電士", icon: "🥉", msg: "基礎はOK。練習あるのみ！" };
    return { title: "みならい", icon: "🔰", msg: "まずは正確さから。あわてず一打ずつ。" };
  }

  const Game = {
    course: null,
    queue: [],
    word: null, // Romaji.Word
    entry: null, // { label, reading, icon }
    qIndex: 0,
    duration: 0,
    wordStart: 0,
    gameStart: 0,
    raf: 0,
    countingDown: false,

    stats: null,

    init() {
      // コース選択
      document.querySelectorAll("[data-course]").forEach((btn) => {
        btn.addEventListener("click", () => {
          Sound.unlock();
          this.start(btn.getAttribute("data-course"));
        });
      });

      // サウンドトグル
      const soundBtn = $("#sound-toggle");
      const syncSoundLabel = () => {
        soundBtn.textContent = Sound.isEnabled() ? "🔊 音あり" : "🔇 音なし";
        soundBtn.setAttribute("aria-pressed", String(Sound.isEnabled()));
      };
      soundBtn.addEventListener("click", () => {
        Sound.setEnabled(!Sound.isEnabled());
        syncSoundLabel();
      });
      syncSoundLabel();

      // リザルト画面のボタン
      $("#again").addEventListener("click", () => this.start(this.course.key));
      $("#to-menu").addEventListener("click", () => this.show("start"));
      $("#quit").addEventListener("click", () => this.abort());

      // 入力
      document.addEventListener("keydown", (e) => this.onKey(e));

      this.show("start");
    },

    show(name) {
      ["start", "game", "result"].forEach((s) => {
        $("#screen-" + s).classList.toggle("active", s === name);
      });
      this.screen = name;
    },

    start(courseKey) {
      const conf = Words.COURSES[courseKey];
      this.course = Object.assign({ key: courseKey }, conf);
      this.queue = shuffle(conf.pool).slice(0, conf.count);
      this.qIndex = 0;
      this.stats = {
        correctKeys: 0,
        missKeys: 0,
        wordsDone: 0,
        wordsMissed: 0,
        elapsedMs: 0,
      };
      this.word = null;
      this.entry = null;

      $("#hud-course").textContent = conf.name;
      $("#hud-total").textContent = conf.count;
      this.updateHud();

      this.show("game");
      this.countdown(() => {
        this.gameStart = performance.now();
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
          void el.offsetWidth; // reflow でアニメ再生
          el.classList.add("pop");
          n -= 1;
          setTimeout(tick, 800);
        } else {
          el.textContent = "START!";
          el.classList.add("pop");
          setTimeout(() => {
            el.classList.remove("show", "pop");
            this.countingDown = false;
            done();
          }, 600);
        }
      };
      tick();
    },

    nextWord() {
      cancelAnimationFrame(this.raf);
      if (this.qIndex >= this.queue.length) {
        this.finish();
        return;
      }
      const entry = this.queue[this.qIndex];
      this.qIndex += 1;
      this.entry = entry;
      this.word = new Romaji.Word(entry.reading);
      this.duration = durationFor(this.word.totalKeys(), this.course.speed);
      this.wordStart = performance.now();

      // お皿の描画
      const plate = $("#plate");
      plate.classList.remove("eaten");
      $("#plate-icon").textContent = entry.icon;
      $("#plate-label").textContent = entry.label;

      this.renderReading();
      this.updateHud();
      this.loop();
    },

    renderReading() {
      $("#reading").textContent = this.entry.reading;
      this.renderGuide(false);
    },

    renderGuide(missFlash) {
      const g = this.word.guide();
      const guide = $("#guide");
      guide.innerHTML =
        '<span class="done">' + escapeHtml(g.done) + "</span>" +
        '<span class="todo">' + escapeHtml(g.todo) + "</span>";
      if (missFlash) {
        guide.classList.remove("miss");
        void guide.offsetWidth;
        guide.classList.add("miss");
      }
    },

    loop() {
      const step = () => {
        if (this.screen !== "game") return;
        const elapsed = performance.now() - this.wordStart;
        const p = Math.min(1, elapsed / this.duration);

        // お皿の位置（右→左）
        const leftPct = 88 - 84 * p;
        $("#plate").style.left = leftPct + "%";

        // 残り時間バー
        $("#timebar-fill").style.width = (100 - p * 100) + "%";
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
      this.stats.wordsMissed += 1;
      Sound.miss();
      const plate = $("#plate");
      plate.classList.add("dropped");
      setTimeout(() => plate.classList.remove("dropped"), 10);
      this.nextWord();
    },

    onKey(e) {
      if (this.screen !== "game" || this.countingDown || !this.word) return;
      if (e.isComposing || e.keyCode === 229) return; // IME 変換中
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (!VALID_KEY.test(key)) return;
      e.preventDefault();

      const res = this.word.input(key);
      if (res.ok) {
        this.stats.correctKeys += 1;
        Sound.type();
        this.renderGuide(false);
        this.updateHud();
        if (res.finished) this.completeWord();
      } else {
        this.stats.missKeys += 1;
        Sound.miss();
        this.renderGuide(true);
        this.updateHud();
      }
    },

    completeWord() {
      cancelAnimationFrame(this.raf);
      this.stats.wordsDone += 1;
      Sound.word();

      // 「食べた（発電した）」演出
      const plate = $("#plate");
      const gain = this.word.totalKeys() * 30 + 150;
      const pop = $("#gain-pop");
      pop.textContent = "+" + gain.toLocaleString() + " kWh";
      pop.style.left = plate.style.left;
      pop.classList.remove("show");
      void pop.offsetWidth;
      pop.classList.add("show");
      plate.classList.add("eaten");

      this.updateHud(); // 発電量・正打数を即時反映
      setTimeout(() => this.nextWord(), 180);
    },

    updateHud() {
      $("#hud-index").textContent = Math.min(this.qIndex, this.course.count);
      $("#hud-correct").textContent = this.stats.correctKeys;
      $("#hud-miss").textContent = this.stats.missKeys;
      const earned = this.earnedPower();
      $("#hud-power").textContent = earned.toLocaleString();
    },

    earnedPower() {
      return this.stats.correctKeys * 30 + this.stats.wordsDone * 150;
    },

    abort() {
      cancelAnimationFrame(this.raf);
      this.show("start");
    },

    finish() {
      cancelAnimationFrame(this.raf);
      const elapsedSec = Math.max(0.001, (performance.now() - this.gameStart) / 1000);
      const s = this.stats;
      const totalKeys = s.correctKeys + s.missKeys;
      const kps = s.correctKeys / elapsedSec;
      const accuracy = totalKeys === 0 ? 0 : (s.correctKeys / totalKeys) * 100;
      const earned = this.earnedPower();
      const target = this.course.power;
      const diff = earned - target;
      const rank = rankOf(kps);
      const co2 = (earned * 0.0004).toFixed(2); // ざっくり係数（t-CO2）

      $("#r-power").textContent = earned.toLocaleString() + " kWh";
      $("#r-target").textContent = target.toLocaleString() + " kWh";

      const balance = $("#r-balance");
      if (diff >= 0) {
        balance.textContent = "黒字！ +" + diff.toLocaleString() + " kWh ⚡";
        balance.className = "balance plus";
      } else {
        balance.textContent = "赤字… " + diff.toLocaleString() + " kWh";
        balance.className = "balance minus";
      }

      $("#r-co2").textContent = co2 + " t-CO₂";
      $("#r-done").textContent = s.wordsDone + " / " + this.course.count;
      $("#r-missed").textContent = s.wordsMissed + " 問";
      $("#r-correct").textContent = s.correctKeys + " 打";
      $("#r-misskey").textContent = s.missKeys + " 打";
      $("#r-acc").textContent = accuracy.toFixed(1) + " %";
      $("#r-kps").textContent = kps.toFixed(2) + " 打/秒";
      $("#r-time").textContent = elapsedSec.toFixed(1) + " 秒";

      $("#r-rank-icon").textContent = rank.icon;
      $("#r-rank-title").textContent = rank.title;
      let msg = rank.msg;
      if (s.wordsMissed === 0 && accuracy === 100) msg = "パーフェクト送電！ミスも取り逃しもゼロ。🌟";
      $("#r-rank-msg").textContent = msg;

      Sound.finish();
      this.show("result");
    },
  };

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  document.addEventListener("DOMContentLoaded", () => Game.init());
})();
