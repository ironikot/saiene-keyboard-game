/*
 * game.js — 再エネ打 ゲーム本体
 *
 * 寿司打を踏襲した「流れてくるお題をローマ字で打つ」タイピングゲーム。
 * コードはすべてオリジナル実装。お題だけ再エネ用語に差し替えてある。
 *
 * スコアまわり:
 *   - 正打1キー = 30 kWh × コンボ倍率
 *   - 1問クリア = 150 kWh × コンボ倍率 + スピードボーナス（残り時間に比例・最大300）
 *   - コンボはミス/取り逃しでリセット。10で×1.5、20で×2、40で×3。
 *   - 20コンボごとにお皿を押し戻す（実質 +1.2秒）。30コンボでフィーバー演出。
 *   - ランキングはこの端末の localStorage にコース別で上位5件を保存。
 */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const VALID_KEY = /^[a-z0-9'\-,./]$/;

  const RANK_KEY = "saieneda.rank.v1";
  const KEY_POWER = 30; // 正打1キーの基礎発電量
  const WORD_POWER = 150; // 1問クリアの基礎発電量
  const SPEED_BONUS_MAX = 300; // 速攻クリアの最大ボーナス
  const COMBO_SHOW_AT = 5; // コンボ表示を始める打数
  const EXTEND_EVERY = 20; // このコンボ数ごとに時間延長
  const EXTEND_MS = 1200;
  const FEVER_AT = 30;

  // 1単語あたりの制限時間（ms）。コースが速いほど短くなる。
  function durationFor(totalKeys, speed) {
    return (1700 + totalKeys * 430) / speed;
  }

  // コンボ数 -> スコア倍率
  function multiplierFor(combo) {
    if (combo >= 40) return 3;
    if (combo >= 20) return 2;
    if (combo >= 10) return 1.5;
    return 1;
  }

  // コンボ数 -> 表示の段階（色分け用）
  function comboTier(combo) {
    if (combo >= 40) return 3;
    if (combo >= 20) return 2;
    if (combo >= 10) return 1;
    return 0;
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

  // ----- ローカルランキング（localStorage。この端末内のみ） -----
  function loadRanks() {
    try {
      return JSON.parse(localStorage.getItem(RANK_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function bestOf(courseKey) {
    const list = loadRanks()[courseKey];
    return list && list.length ? list[0].power : null;
  }

  function addRank(courseKey, entry) {
    const all = loadRanks();
    const list = (all[courseKey] || []).concat([entry]);
    list.sort((a, b) => b.power - a.power);
    all[courseKey] = list.slice(0, 5);
    try {
      localStorage.setItem(RANK_KEY, JSON.stringify(all));
    } catch (e) {
      // プライベートブラウズ等で保存できない場合は表示だけ行う
    }
    return { list: all[courseKey], rank: all[courseKey].indexOf(entry) };
  }

  const Game = {
    course: null,
    queue: [],
    word: null, // Romaji.Word
    entry: null, // { label, reading, icon }
    qIndex: 0,
    duration: 0,
    wordStart: 0,
    wordPower: 0, // いま打っている単語で稼いだ kWh（ポップ表示用）
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
      if (name === "start") this.renderBests();
      if (name !== "game") this.setFever(false);
    },

    // コースカードに自己ベストを表示
    renderBests() {
      document.querySelectorAll("[data-best]").forEach((el) => {
        const best = bestOf(el.getAttribute("data-best"));
        el.textContent = best == null ? "" : "自己ベスト " + best.toLocaleString() + " kWh";
      });
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
        combo: 0,
        maxCombo: 0,
        power: 0,
      };
      this.word = null;
      this.entry = null;
      this.wordPower = 0;
      this.renderCombo(false);
      this.setFever(false);

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
      this.wordPower = 0;

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
      this.breakCombo();
      Sound.miss();
      const plate = $("#plate");
      plate.classList.add("dropped");
      setTimeout(() => plate.classList.remove("dropped"), 10);
      this.nextWord();
    },

    onKey(e) {
      if (this.screen !== "game" || this.countingDown || !this.word) return;
      if (this.word.finished) return; // 次のお皿が来るまでの連打はミス扱いにしない
      if (e.isComposing || e.keyCode === 229) return; // IME 変換中
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (!VALID_KEY.test(key)) return;
      e.preventDefault();

      const res = this.word.input(key);
      if (res.ok) {
        const s = this.stats;
        s.correctKeys += 1;
        s.combo += 1;
        if (s.combo > s.maxCombo) s.maxCombo = s.combo;

        const gain = Math.round(KEY_POWER * multiplierFor(s.combo));
        s.power += gain;
        this.wordPower += gain;

        Sound.type(s.combo);
        this.spark();
        this.renderCombo(true);
        if (s.combo % EXTEND_EVERY === 0) this.extendTime();
        if (s.combo === FEVER_AT) this.setFever(true);

        this.renderGuide(false);
        this.updateHud();
        if (res.finished) this.completeWord();
      } else {
        this.stats.missKeys += 1;
        this.breakCombo();
        Sound.miss();
        this.renderGuide(true);
        this.updateHud();
      }
    },

    breakCombo() {
      this.stats.combo = 0;
      this.setFever(false);
      this.renderCombo(false);
    },

    renderCombo(pulse) {
      const el = $("#combo");
      const c = this.stats ? this.stats.combo : 0;
      if (c < COMBO_SHOW_AT) {
        el.className = "combo";
        return;
      }
      el.className = "combo show t" + comboTier(c);
      $("#combo-n").textContent = c;
      const m = multiplierFor(c);
      $("#combo-x").textContent = m > 1 ? "×" + m : "";
      if (pulse) {
        el.classList.remove("pop");
        void el.offsetWidth;
        el.classList.add("pop");
      }
    },

    // コンボ報酬: 進行中のお皿を押し戻す（締め切りを実質延長）
    extendTime() {
      this.wordStart = Math.min(this.wordStart + EXTEND_MS, performance.now());
      Sound.extend();
      const ext = $("#time-ext");
      ext.classList.remove("show");
      void ext.offsetWidth;
      ext.classList.add("show");
    },

    setFever(on) {
      const was = $("#screen-game").classList.contains("fever");
      $("#screen-game").classList.toggle("fever", !!on);
      if (on && !was) Sound.fever();
    },

    // 打鍵ごとの小さなスパーク演出（10コンボ以上で出現）
    spark() {
      if (this.stats.combo < 10) return;
      const host = $("#sparks");
      if (host.childElementCount > 14) return;
      const sp = document.createElement("span");
      sp.className = "spark";
      sp.textContent = this.stats.combo >= FEVER_AT ? "⚡" : "✦";
      sp.style.left = 30 + Math.random() * 40 + "%";
      host.appendChild(sp);
      sp.addEventListener("animationend", () => sp.remove());
    },

    completeWord() {
      cancelAnimationFrame(this.raf);
      const s = this.stats;
      s.wordsDone += 1;

      // 速攻クリアほどボーナス（残り時間の割合に比例）
      const remain = Math.max(0, 1 - (performance.now() - this.wordStart) / this.duration);
      const speedBonus = Math.round((SPEED_BONUS_MAX * remain) / 10) * 10;
      const clearGain = Math.round(WORD_POWER * multiplierFor(s.combo)) + speedBonus;
      s.power += clearGain;

      Sound.word();

      // 「食べた（発電した）」演出
      const plate = $("#plate");
      const pop = $("#gain-pop");
      const label = remain >= 0.5 ? "⚡超速！" : remain >= 0.25 ? "🔥高速！" : "";
      pop.textContent = label + " +" + (this.wordPower + clearGain).toLocaleString() + " kWh";
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
      $("#hud-power").textContent = this.stats.power.toLocaleString();
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
      const earned = s.power;
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
      $("#r-maxcombo").textContent = s.maxCombo;
      $("#r-time").textContent = elapsedSec.toFixed(1) + " 秒";

      $("#r-rank-icon").textContent = rank.icon;
      $("#r-rank-title").textContent = rank.title;
      let msg = rank.msg;
      if (s.wordsMissed === 0 && accuracy === 100) msg = "パーフェクト送電！ミスも取り逃しもゼロ。🌟";
      $("#r-rank-msg").textContent = msg;

      // ランキング更新（この端末内）
      const entry = {
        power: earned,
        kps: Number(kps.toFixed(2)),
        acc: Number(accuracy.toFixed(1)),
        maxCombo: s.maxCombo,
        date: new Date().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
      };
      const ranked = addRank(this.course.key, entry);
      this.renderRanking(ranked.list, entry);

      const banner = $("#r-record");
      const isRecord = ranked.rank === 0 && ranked.list.length > 1;
      banner.classList.toggle("show", isRecord);

      if (isRecord) Sound.record();
      else Sound.finish();
      this.show("result");
    },

    renderRanking(list, entry) {
      const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
      $("#r-ranking").innerHTML = list
        .map((e, i) => {
          const cls = e === entry ? "rank-row new" : "rank-row";
          return (
            '<div class="' + cls + '">' +
            '<span class="rank-medal">' + medals[i] + "</span>" +
            '<span class="rank-power">' + e.power.toLocaleString() + " kWh</span>" +
            '<span class="rank-meta">' + Number(e.kps).toFixed(2) + " 打/秒 ・ 最大" + e.maxCombo + "コンボ ・ " + escapeHtml(String(e.date)) + "</span>" +
            (e === entry ? '<span class="rank-new-badge">NEW</span>' : "") +
            "</div>"
          );
        })
        .join("");
    },
  };

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  document.addEventListener("DOMContentLoaded", () => Game.init());
})();
