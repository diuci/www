// 丢词大作战 — 接诗玩法（Quiz）
//
// 玩法：对局中每隔一段时间，屏幕上出现一句诗的**上句**，给三个选项，限时选下句。
//   · 答对 → 全队大招能量补给 + 屏幕「好句！」 + 在你脚下刻出这两句
//   · 答错 → 只补墨，不罚
//   · 超时 → 什么都不给
//
// 交互双通道：
//   · 按键 1/2/3（默认）
//   · 语音念出来（可选，settings.voiceQuiz）—— 用 Web Speech API
//
// 关键设计：**不暂停游戏**。题目显示在屏幕边缘，玩家一边打一边答。
import { POEMS, poemsOfGrade, poemById } from './poems.js';

// 出题节奏
export const QUIZ = {
  firstDelay: 22,        // 开局多久出第一题（秒）
  gap: [26, 40],         // 两题之间的间隔（秒）
  answerTime: 6.0,       // 答题时限（秒）
  answerTimeEasy: 8.0,   // 低难度放宽
  options: 3,            // 选项数
  rewardSpecial: 0.5,    // 答对给全队的大招能量（占满格的比例）
  rewardInk: 1.0,        // 答对补满墨
  wrongInk: 0.35,        // 答错只补一点墨
  teamReveal: true,      // 全队看到谁接上了
};

const rnd = (a, b) => a + Math.random() * (b - a);

export class PoemQuiz {
  constructor(match) {
    this.match = match;
    this.active = null;        // { poem, askIndex, options:[poemId], correct:0|1|2, t, limit, answeredBy }
    this.nextAt = QUIZ.firstDelay;
    this.history = [];         // { poemId, by, ok, t }
    this.stats = [0, 0];       // 每队答对次数
  }

  // 从诗库里挑一道题：取一首有配对句的诗，用它的上句问下句
  _makeQuestion(grade) {
    const pool = poemsOfGrade(grade).length ? poemsOfGrade(grade) : POEMS;
    // 优先挑 4 句以上的（有更多干扰项可选）
    const cands = pool.filter((p) => p.lines.length >= 4);
    const use = cands.length ? cands : pool;
    // 出题用的诗：**两句都必须是正常长度**（≥4 字），否则《咏鹅》那种单字行会变成
    // 只有一两个字的题目/选项，玩家看着别扭
    const good = use.filter((p) => p.lines.slice(0, 4).every((l) => l.length >= 4));
    const askPool = good.length ? good : use;
    const poem = askPool[(Math.random() * askPool.length) | 0];
    const ask = 0;                                   // 问第 1 句，答第 2 句
    const correctLine = poem.lines[ask + 1];
    // 干扰项：从别的诗里取，语义上要和正确答案不同。
    // 注意：必须排除单字行（《咏鹅》被拆成"鹅/鹅/鹅"），否则会出现只有一个字的选项。
    const others = [];
    const seen = new Set([correctLine]);
    const okLen = (s) => s && s.length >= 3;      // 至少 3 个字才配当选项
    let guard = 0;
    while (others.length < QUIZ.options - 1 && guard++ < 400) {
      const q = use[(Math.random() * use.length) | 0];
      if (q.id === poem.id) continue;
      const line = q.lines[(Math.random() * q.lines.length) | 0];
      if (!okLen(line) || seen.has(line)) continue;
      // 干扰项字数要和正确答案接近（差 ≤2），否则一眼就能靠长度排除
      if (Math.abs(line.length - correctLine.length) > 2) continue;
      seen.add(line);
      others.push({ poemId: q.id, line, text: line });
    }
    // 兜底：万一没凑够（诗库小时可能），放宽字数限制
    guard = 0;
    while (others.length < QUIZ.options - 1 && guard++ < 400) {
      const q = use[(Math.random() * use.length) | 0];
      if (q.id === poem.id) continue;
      const line = q.lines[(Math.random() * q.lines.length) | 0];
      if (!okLen(line) || seen.has(line)) continue;
      seen.add(line);
      others.push({ poemId: q.id, line, text: line });
    }
    const opts = [{ poemId: poem.id, text: correctLine, ok: true },
      ...others.map((o) => ({ poemId: o.poemId, text: o.line, ok: false }))];
    // 洗牌（记住正确答案的新位置）
    for (let i = opts.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    const correct = opts.findIndex((o) => o.ok);
    return { poem, askIndex: ask, askText: poem.lines[ask], options: opts, correct };
  }

  update(dt) {
    const m = this.match;
    if (!m || m.state !== 'playing' || m.attract || m.practice) return;
    // 设置里可以关掉接诗答题（G.settings.quiz）
    if (m.quizEnabled === false) { if (this.active) this._resolve(null); return; }
    if (this.active) {
      this.active.t += dt;
      if (this.active.t >= this.active.limit) this._resolve(null);   // 超时
      return;
    }
    this.nextAt -= dt;
    if (this.nextAt > 0) return;
    this._ask();
  }

  _ask() {
    const grade = this.match.opts.grade || 1;
    const easy = (this.match.opts.difficulty || 'normal') === 'easy';
    const q = this._makeQuestion(grade);
    this.active = { ...q, t: 0, limit: easy ? QUIZ.answerTimeEasy : QUIZ.answerTime, answeredBy: null };
    this.match.emitQuiz?.('ask', this.active);
  }

  // 玩家按键答题（idx 0..2）
  answer(idx, actor = null) {
    const a = this.active;
    if (!a || a.answeredBy) return false;
    const who = actor || this.match.local;
    if (!who) return false;
    const ok = idx === a.correct;
    this._resolve({ actor: who, idx, ok });
    return ok;
  }

  // 语音识别到文本后调用：匹配是否命中某个选项
  answerByText(text, actor = null) {
    const a = this.active;
    if (!a || a.answeredBy || !text) return null;
    const norm = (s) => String(s).replace(/[^\u4e00-\u9fff]/g, '');
    const said = norm(text);
    if (!said) return null;
    // 命中判定：说出的内容包含某个选项全文，或选项包含说出内容（至少 3 字）
    let hit = -1;
    for (let i = 0; i < a.options.length; i++) {
      const o = norm(a.options[i].text);
      if (!o) continue;
      if (said.includes(o) || (said.length >= 3 && o.includes(said))) { hit = i; break; }
    }
    if (hit < 0) return null;
    const ok = hit === a.correct;
    this._resolve({ actor: actor || this.match.local, idx: hit, ok, byVoice: true });
    return ok;
  }

  _resolve(res) {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.nextAt = rnd(QUIZ.gap[0], QUIZ.gap[1]);
    const t = this.match.duration - this.match.time;
    if (res) {
      this.history.push({ poemId: a.poem.id, askIndex: a.askIndex, by: res.actor?.name, ok: res.ok, t, byVoice: !!res.byVoice });
      if (res.ok) this.stats[res.actor?.team ?? 0]++;
    }
    this.match.onQuizResult?.(a, res);
  }

  // HUD 需要的数据
  state() {
    const a = this.active;
    if (!a) return null;
    return {
      ask: a.askText,
      title: a.poem.title,
      options: a.options.map((o, i) => ({ i, text: o.text })),
      correct: a.correct,
      left: Math.max(0, a.limit - a.t),
      limit: a.limit,
    };
  }
}

// ---------------------------------------------------------------- 语音答题（可选）
// Web Speech API：Chrome/Edge/Safari 支持，Firefox 需要 160+。音频会上传到浏览器厂商的服务器。
export class VoiceAnswer {
  constructor(onText) {
    this.onText = onText;
    this.rec = null;
    this.on = false;
    this.supported = typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    this.lastError = null;
  }

  start() {
    if (!this.supported || this.on) return false;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    try {
      const rec = new SR();
      rec.lang = 'zh-CN';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 3;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const txt = e.results[i][0]?.transcript;
          if (txt) this.onText(txt.trim(), e.results[i].isFinal);
        }
      };
      rec.onerror = (e) => { this.lastError = e.error || 'error'; };
      rec.onend = () => { if (this.on) { try { rec.start(); } catch { /* restart guard */ } } };
      rec.start();
      this.rec = rec; this.on = true;
      return true;
    } catch (e) { this.lastError = String(e.message || e); return false; }
  }

  stop() {
    this.on = false;
    try { this.rec?.stop(); } catch { /* gone */ }
    this.rec = null;
  }
}
