/*
 * words.js — 再エネ単語データ
 *
 * label   : お皿に表示する見出し（漢字・カタカナ）
 * reading : タイピング対象の読み（ひらがな/カタカナ）
 * icon    : 雰囲気の絵文字
 *
 * 注意: ローマ字入力の都合上、「ん」の直後に母音・な行・や行が来る読みは
 *       避けている（入力判定が曖昧になるため）。
 */
(function (global) {
  "use strict";

  const EASY = [
    { label: "太陽", reading: "たいよう", icon: "☀️" },
    { label: "風", reading: "かぜ", icon: "🌬️" },
    { label: "電気", reading: "でんき", icon: "⚡" },
    { label: "発電", reading: "はつでん", icon: "🔌" },
    { label: "風力", reading: "ふうりょく", icon: "🌀" },
    { label: "水力", reading: "すいりょく", icon: "💧" },
    { label: "地熱", reading: "ちねつ", icon: "🌋" },
    { label: "蓄電", reading: "ちくでん", icon: "🔋" },
    { label: "送電", reading: "そうでん", icon: "🗼" },
    { label: "電力", reading: "でんりょく", icon: "💡" },
    { label: "電池", reading: "でんち", icon: "🔋" },
    { label: "ソーラー", reading: "そーらー", icon: "🔆" },
    { label: "パネル", reading: "ぱねる", icon: "🟦" },
    { label: "バイオ", reading: "ばいお", icon: "🌱" },
    { label: "水素", reading: "すいそ", icon: "💨" },
    { label: "省エネ", reading: "しょうえね", icon: "🍃" },
    { label: "節電", reading: "せつでん", icon: "🔅" },
    { label: "電源", reading: "でんげん", icon: "🔘" },
    { label: "出力", reading: "しゅつりょく", icon: "📈" },
    { label: "余剰", reading: "よじょう", icon: "➕" },
  ];

  const NORMAL = [
    { label: "太陽光", reading: "たいようこう", icon: "☀️" },
    { label: "風力発電", reading: "ふうりょくはつでん", icon: "🌀" },
    { label: "再生可能", reading: "さいせいかのう", icon: "♻️" },
    { label: "蓄電池", reading: "ちくでんち", icon: "🔋" },
    { label: "送電網", reading: "そうでんもう", icon: "🗼" },
    { label: "脱炭素", reading: "だつたんそ", icon: "🌍" },
    { label: "二酸化炭素", reading: "にさんかたんそ", icon: "💨" },
    { label: "地熱発電", reading: "ちねつはつでん", icon: "🌋" },
    { label: "メガソーラー", reading: "めがそーらー", icon: "🔆" },
    { label: "インバーター", reading: "いんばーたー", icon: "🔧" },
    { label: "タービン", reading: "たーびん", icon: "🌬️" },
    { label: "カーボンゼロ", reading: "かーぼんぜろ", icon: "🟢" },
    { label: "電気自動車", reading: "でんきじどうしゃ", icon: "🚗" },
    { label: "系統連系", reading: "けいとうれんけい", icon: "🔗" },
    { label: "余剰電力", reading: "よじょうでんりょく", icon: "➕" },
    { label: "環境負荷", reading: "かんきょうふか", icon: "🌿" },
    { label: "発電所", reading: "はつでんしょ", icon: "🏭" },
    { label: "電力会社", reading: "でんりょくがいしゃ", icon: "🏢" },
    { label: "自家消費", reading: "じかしょうひ", icon: "🏠" },
    { label: "卒業", reading: "そつぎょう", icon: "🎓" },
    { label: "潮流発電", reading: "ちょうりゅうはつでん", icon: "🌊" },
    { label: "化石燃料", reading: "かせきねんりょう", icon: "🛢️" },
    // JERA Cross 公式サイト由来の公開用語（標準コースに彩りを追加）
    { label: "環境価値", reading: "かんきょうかち", icon: "♻️" },
    { label: "非化石証書", reading: "ひかせきしょうしょ", icon: "📜" },
    { label: "自己託送", reading: "じこたくそう", icon: "🚚" },
    { label: "電力調達", reading: "でんりょくちょうたつ", icon: "🛒" },
  ];

  const HARD = [
    { label: "再生可能エネルギー", reading: "さいせいかのうえねるぎー", icon: "♻️" },
    { label: "洋上風力発電", reading: "ようじょうふうりょくはつでん", icon: "🌊" },
    { label: "地球温暖化", reading: "ちきゅうおんだんか", icon: "🌡️" },
    { label: "電力自由化", reading: "でんりょくじゆうか", icon: "📉" },
    { label: "非化石燃料", reading: "ひかせきねんりょう", icon: "🛢️" },
    { label: "温室効果ガス", reading: "おんしつこうかがす", icon: "🏭" },
    { label: "水素エネルギー", reading: "すいそえねるぎー", icon: "💨" },
    { label: "分散型電源", reading: "ぶんさんがたでんげん", icon: "🔘" },
    { label: "需給調整", reading: "じゅきゅうちょうせい", icon: "⚖️" },
    { label: "固定価格買取", reading: "こていかかくかいとり", icon: "💴" },
    { label: "電力需要", reading: "でんりょくじゅよう", icon: "📊" },
    { label: "蓄電システム", reading: "ちくでんしすてむ", icon: "🔋" },
    { label: "脱炭素社会", reading: "だつたんそしゃかい", icon: "🌍" },
    { label: "省エネルギー", reading: "しょうえねるぎー", icon: "🍃" },
    { label: "持続可能性", reading: "じぞくかのうせい", icon: "🌱" },
    { label: "電力供給", reading: "でんりょくきょうきゅう", icon: "🔌" },
    { label: "太陽光パネル", reading: "たいようこうぱねる", icon: "🔆" },
    { label: "エネルギー転換", reading: "えねるぎーてんかん", icon: "🔄" },
    { label: "送配電網", reading: "そうはいでんもう", icon: "🗼" },
    { label: "炭素中立", reading: "たんそちゅうりつ", icon: "🟢" },
    // JERA Cross 公式サイト由来の公開用語（達人コースに彩りを追加）
    { label: "カーボンフリー電力", reading: "かーぼんふりーでんりょく", icon: "🟢" },
    { label: "エネルギーソリューション", reading: "えねるぎーそりゅーしょん", icon: "🔧" },
    { label: "非化石価値取引", reading: "ひかせきかちとりひき", icon: "💹" },
  ];

  // 事業用語（JERA Cross 公式サイト https://www.jera-cross.com/ より）
  // すべて公開情報。脱炭素・再エネ調達まわりの「ちょっと玄人な」用語を集めたコース。
  const BUSINESS = [
    { label: "脱炭素", reading: "だつたんそ", icon: "🌍" },
    { label: "環境価値", reading: "かんきょうかち", icon: "♻️" },
    { label: "非化石証書", reading: "ひかせきしょうしょ", icon: "📜" },
    { label: "オンサイト", reading: "おんさいと", icon: "🏠" },
    { label: "オフサイト", reading: "おふさいと", icon: "🌄" },
    { label: "自己託送", reading: "じこたくそう", icon: "🚚" },
    { label: "電力調達", reading: "でんりょくちょうたつ", icon: "🛒" },
    { label: "発電計画", reading: "はつでんけいかく", icon: "📅" },
    { label: "発電設備", reading: "はつでんせつび", icon: "🏭" },
    { label: "電力小売", reading: "でんりょくこうり", icon: "🏪" },
    { label: "インバランス精算", reading: "いんばらんすせいさん", icon: "⚖️" },
    { label: "再エネアグリ", reading: "さいえねあぐり", icon: "🌾" },
    { label: "グリーン電力", reading: "ぐりーんでんりょく", icon: "💚" },
    { label: "カーボンフリー電力", reading: "かーぼんふりーでんりょく", icon: "🟢" },
    { label: "非化石価値取引", reading: "ひかせきかちとりひき", icon: "💹" },
    { label: "エネルギーマネジメント", reading: "えねるぎーまねじめんと", icon: "📊" },
    { label: "エネルギーソリューション", reading: "えねるぎーそりゅーしょん", icon: "🔧" },
    { label: "脱炭素プレミアム", reading: "だつたんそぷれみあむ", icon: "💎" },
    { label: "脱炭素ロードマップ", reading: "だつたんそろーどまっぷ", icon: "🗺️" },
    { label: "グリーントランスフォーメーション", reading: "ぐりーんとらんすふぉーめーしょん", icon: "🔄" },
  ];

  const COURSES = {
    easy: { name: "お手軽コース", desc: "10問・かんたん", count: 10, pool: EASY, speed: 1.0, power: 4000 },
    normal: { name: "お勧めコース", desc: "15問・ふつう", count: 15, pool: NORMAL.concat(EASY), speed: 1.25, power: 7000 },
    hard: { name: "達人コース", desc: "20問・むずかしい", count: 20, pool: HARD.concat(NORMAL), speed: 1.55, power: 12000 },
    business: { name: "事業用語コース", desc: "18問・実戦", count: 18, pool: BUSINESS, speed: 1.2, power: 10000 },
  };

  global.Words = { EASY, NORMAL, HARD, BUSINESS, COURSES };
})(window);
