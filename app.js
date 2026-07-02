const STORAGE_KEY = "spanish_word_garden_v1";
const REVIEW_STEPS = [1, 2, 4, 7, 15, 30];
const SPECIAL_KEYS = ["á", "é", "í", "ó", "ú", "ü", "ñ", "¿", "¡"];

const todayKey = () => new Date().toISOString().slice(0, 10);
const addDays = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const seedWords = [
  { es: "tomate", cn: "番茄", note: "el tomate" },
  { es: "girasol", cn: "向日葵", note: "el girasol" },
  { es: "fresa", cn: "草莓", note: "la fresa" },
];

const freshWord = (word) => ({
  id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  es: word.es.trim(),
  cn: word.cn.trim(),
  note: (word.note || "").trim(),
  createdAt: todayKey(),
  due: todayKey(),
  stage: 0,
  learnedToday: 0,
  lastStudied: "",
  correctCount: 0,
  wrongCount: 0,
});

const defaultState = () => ({
  words: seedWords.map(freshWord),
  activeTab: "learn",
  direction: "es-cn",
  dailyTarget: 10,
  currentId: "",
  showAnswer: false,
  typed: "",
  editingId: "",
  form: { es: "", cn: "", note: "" },
  bulkText: "",
  checkins: {},
  toast: "",
});

let state = loadState();
let toastTimer = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.words)) {
      return { ...defaultState(), ...saved, toast: "", activeTab: "learn", showAnswer: false, typed: "" };
    }
  } catch (error) {
    console.warn(error);
  }
  return defaultState();
}

function saveState() {
  const { toast, showAnswer, typed, activeTab, ...saved } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

function showToast(message) {
  state.toast = message;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = "";
    render();
  }, 1800);
}

function dueWords() {
  return plannedWords().filter((word) => !isDoneToday(word));
}

function todaysDoneWords() {
  return plannedWords().filter(isDoneToday);
}

function repsToday(word) {
  return word.lastStudied === todayKey() ? word.learnedToday : 0;
}

function isDoneToday(word) {
  return word.lastStudied === todayKey() && word.learnedToday >= 3;
}

function plannedWords() {
  const today = todayKey();
  const target = Math.max(1, Number(state.dailyTarget) || 10);
  return state.words.filter((word) => word.lastStudied === today || word.due <= today).slice(0, target);
}

function currentWord() {
  const due = dueWords();
  if (!due.length) return null;
  return due.find((word) => word.id === state.currentId) || due[0];
}

function todayProgress() {
  const done = todaysDoneWords().length;
  const total = Math.max(plannedWords().length, 1);
  return Math.round((done / total) * 100);
}

function switchTab(tab) {
  state.activeTab = tab;
  state.showAnswer = false;
  state.typed = "";
  render();
}

function updateForm(field, value) {
  state.form[field] = value;
}

function resetForm() {
  state.form = { es: "", cn: "", note: "" };
  state.editingId = "";
}

function submitWord() {
  const es = state.form.es.trim();
  const cn = state.form.cn.trim();
  if (!es || !cn) {
    showToast("西班牙语和中文都要填");
    return;
  }

  if (state.editingId) {
    state.words = state.words.map((word) =>
      word.id === state.editingId ? { ...word, es, cn, note: state.form.note.trim() } : word
    );
    showToast("单词已更新");
  } else {
    state.words.unshift(freshWord({ es, cn, note: state.form.note }));
    showToast("种下一颗新单词");
  }

  resetForm();
  saveState();
  render();
}

function updateBulkImport(value) {
  state.bulkText = value;
}

function parseImportText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const cleaned = line.replace(/^\d+[.)、]\s*/, "");
      const parts = cleaned.split(/\s*(?:\t|,|，|\||｜|;|；| - | — | = |：|:)\s*/).filter(Boolean);
      if (parts.length >= 2) {
        return {
          es: parts[0],
          cn: parts[1],
          note: parts.slice(2).join(" / "),
        };
      }

      const spaced = cleaned.match(/^(.+?)\s{2,}(.+)$/);
      if (spaced) {
        return { es: spaced[1], cn: spaced[2], note: "" };
      }

      return null;
    })
    .filter((word) => word && word.es && word.cn);
}

function importWordsFromText(text) {
  const parsed = parseImportText(text);
  if (!parsed.length) {
    showToast("没有识别到单词");
    return;
  }

  const existing = new Set(state.words.map((word) => `${normalize(word.es)}|${normalize(word.cn)}`));
  const fresh = [];
  parsed.forEach((word) => {
    const key = `${normalize(word.es)}|${normalize(word.cn)}`;
    if (!existing.has(key)) {
      existing.add(key);
      fresh.push(freshWord(word));
    }
  });

  if (!fresh.length) {
    showToast("这些单词已经导入过了");
    return;
  }

  state.words = [...fresh, ...state.words];
  state.bulkText = "";
  saveState();
  showToast(`成功导入 ${fresh.length} 个单词`);
}

function submitBulkImport() {
  importWordsFromText(state.bulkText);
}

function importFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => importWordsFromText(String(reader.result || ""));
  reader.onerror = () => showToast("文件读取失败");
  reader.readAsText(file, "UTF-8");
}

function editWord(id) {
  const word = state.words.find((item) => item.id === id);
  if (!word) return;
  state.form = { es: word.es, cn: word.cn, note: word.note || "" };
  state.editingId = id;
  state.activeTab = "add";
  render();
}

function deleteWord(id) {
  state.words = state.words.filter((word) => word.id !== id);
  if (state.currentId === id) state.currentId = "";
  saveState();
  showToast("已删除");
}

function setDirection(direction) {
  state.direction = direction;
  state.showAnswer = false;
  state.typed = "";
  saveState();
  render();
}

function setDailyTarget(value) {
  const target = Math.max(1, Math.min(100, Number(value) || 10));
  state.dailyTarget = target;
  state.currentId = "";
  state.showAnswer = false;
  state.typed = "";
  saveState();
  render();
}

function insertSpecialKey(char) {
  state.typed = `${state.typed}${char}`;
  render();
  const input = document.querySelector(".type-input");
  if (input) input.focus();
}

function normalize(text) {
  return text.trim().toLowerCase().replace(/[¿?¡!.,，。]/g, "");
}

function submitTypedAnswer() {
  const word = currentWord();
  if (!word) return;
  if (!state.typed.trim()) {
    showToast("先输入答案");
    return;
  }
  const ok = normalize(state.typed) === normalize(word.es);
  finishRound(ok);
}

function finishRound(isCorrect) {
  const word = currentWord();
  if (!word) return;
  const today = todayKey();
  const nextCount = repsToday(word) + (isCorrect ? 1 : 0);
  const completed = nextCount >= 3;
  const nextStage = isCorrect && completed ? Math.min(word.stage + 1, REVIEW_STEPS.length - 1) : Math.max(word.stage - 1, 0);
  const nextDue = completed ? addDays(today, REVIEW_STEPS[nextStage]) : today;

  state.words = state.words.map((item) => {
    if (item.id !== word.id) return item;
    return {
      ...item,
      learnedToday: nextCount,
      lastStudied: today,
      stage: nextStage,
      due: nextDue,
      correctCount: item.correctCount + (isCorrect ? 1 : 0),
      wrongCount: item.wrongCount + (isCorrect ? 0 : 1),
    };
  });

  state.currentId = nextWordIdAfter(word.id);
  state.showAnswer = false;
  state.typed = "";
  saveState();

  if (completed) {
    showToast("这个单词今天完成 3 遍");
  } else {
    showToast(isCorrect ? "答对了，再来一遍" : "没关系，今天继续练");
  }
}

function nextWordIdAfter(previousId) {
  const plan = plannedWords();
  const remainingIds = new Set(dueWords().map((word) => word.id));
  if (!remainingIds.size) return "";

  const start = Math.max(0, plan.findIndex((word) => word.id === previousId));
  for (let offset = 1; offset <= plan.length; offset += 1) {
    const candidate = plan[(start + offset) % plan.length];
    if (candidate && remainingIds.has(candidate.id)) return candidate.id;
  }

  return dueWords()[0]?.id || "";
}

function checkIn() {
  const today = todayKey();
  if (!state.words.length) {
    showToast("先录入单词再打卡");
    return;
  }
  if (dueWords().length) {
    showToast("先完成今天背诵再打卡");
    return;
  }
  state.checkins[today] = true;
  saveState();
  showToast("今日打卡完成");
}

function streakCount() {
  let count = 0;
  let cursor = todayKey();
  while (state.checkins[cursor]) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function renderHero() {
  const progress = todayProgress();
  const due = dueWords().length;
  const planned = plannedWords().length;
  const done = todaysDoneWords().length;
  const targets = [5, 10, 15, 20, 30, 50];
  return `
    <section class="hero-card compact-hero">
      <div class="study-summary">
        <div>
          <span class="mini-label">今日任务</span>
          <strong>${done}/${planned}</strong>
          <small>剩余 ${due}</small>
        </div>
        <label class="target-control">
          今天背
          <select onchange="setDailyTarget(this.value)">
            ${targets
              .map((target) => `<option value="${target}" ${Number(state.dailyTarget) === target ? "selected" : ""}>${target}</option>`)
              .join("")}
          </select>
        </label>
      </div>
      <div class="progress compact-progress"><span style="width:${progress}%"></span></div>
      <div class="status-line compact-status">
        <span>${due ? "READY" : "DONE"} · ${progress}%</span>
        <div class="mode-switch" aria-label="背诵方向">
          <button class="${state.direction === "es-cn" ? "active" : ""}" onclick="setDirection('es-cn')">西→中</button>
          <button class="${state.direction === "cn-es" ? "active" : ""}" onclick="setDirection('cn-es')">中→西</button>
        </div>
      </div>
    </section>
  `;
}

function renderLearn() {
  const word = currentWord();
  if (!word) {
    return `
      ${renderHero()}
      <div class="section-title"><span class="section-icon">🏆</span> 今日完成</div>
      <section class="panel learn-card">
        <div class="card-emoji">🎉</div>
        <div class="prompt">今天的学习完成啦</div>
        <p class="word-cn">可以去打卡，明天会按记忆曲线安排复习。</p>
        <button class="primary-btn" onclick="switchTab('checkin')">去打卡</button>
      </section>
    `;
  }

  const prompt = state.direction === "es-cn" ? word.es : word.cn;
  const answer = state.direction === "es-cn" ? word.cn : word.es;
  const typing = state.direction === "cn-es";
  return `
    ${renderHero()}
    <section class="panel learn-card">
      <div class="card-emoji">${typing ? "✍️" : "🍅"}</div>
      <div class="prompt">${escapeHtml(prompt)}</div>
      <div class="word-meta" style="justify-content:center">
        <span class="pill">今日 ${repsToday(word)}/3</span>
        <span class="pill">阶段 ${word.stage + 1}</span>
      </div>
      ${
        typing
          ? renderTyping(word)
          : `
            ${state.showAnswer ? `<div class="answer">${escapeHtml(answer)}</div>` : ""}
            <div class="review-buttons">
              <button class="ghost-btn" onclick="state.showAnswer=true; render()">看答案</button>
              <button class="small-btn" onclick="finishRound(true)">我记得</button>
            </div>
            <button class="danger-btn" onclick="finishRound(false)">还不熟</button>
          `
      }
    </section>
  `;
}

function renderTyping(word) {
  return `
    <div class="typing-area">
      <input class="type-input" value="${escapeAttr(state.typed)}" placeholder="输入西班牙语" oninput="state.typed=this.value" />
      <div class="keyboard">
        ${SPECIAL_KEYS.map((key) => `<button class="key" onclick="insertSpecialKey('${key}')">${key}</button>`).join("")}
      </div>
      ${state.showAnswer ? `<div class="answer">${escapeHtml(word.es)}</div>` : ""}
      <div class="review-buttons">
        <button class="ghost-btn" onclick="state.showAnswer=true; render()">答案</button>
        <button class="small-btn" onclick="submitTypedAnswer()">提交</button>
      </div>
      <button class="danger-btn" onclick="finishRound(false)">不会</button>
    </div>
  `;
}

function renderAdd() {
  return `
    ${renderHero()}
    <div class="section-title"><span class="section-icon">🌱</span> 录入单词</div>
    <section class="panel">
      <div class="form-grid">
        <div class="field">
          <label>西班牙语</label>
          <input value="${escapeAttr(state.form.es)}" placeholder="例如: buenos días" oninput="updateForm('es', this.value)" />
        </div>
        <div class="field">
          <label>中文意思</label>
          <input value="${escapeAttr(state.form.cn)}" placeholder="例如: 早上好" oninput="updateForm('cn', this.value)" />
        </div>
        <div class="field">
          <label>备注 / 例句</label>
          <textarea placeholder="可选：词性、例句、容易混淆点" oninput="updateForm('note', this.value)">${escapeHtml(state.form.note)}</textarea>
        </div>
        <div class="keyboard">
          ${SPECIAL_KEYS.map((key) => `<button class="key" onclick="state.form.es += '${key}'; render()">${key}</button>`).join("")}
        </div>
        <div class="form-actions">
          <button class="ghost-btn" onclick="resetForm(); render()">清空</button>
          <button class="small-btn" onclick="submitWord()">${state.editingId ? "保存修改" : "种下单词"}</button>
        </div>
      </div>
    </section>
    <div class="section-title"><span class="section-icon">📥</span> 批量导入</div>
    <section class="panel">
      <div class="form-grid">
        <div class="field">
          <label>粘贴单词表</label>
          <textarea class="bulk-area" placeholder="每行一个：&#10;hola, 你好&#10;buenos días - 早上好&#10;gracias｜谢谢｜常用表达" oninput="updateBulkImport(this.value)">${escapeHtml(state.bulkText)}</textarea>
        </div>
        <p class="import-hint">支持逗号、横线、竖线、Tab 分隔；第三列会当作备注。</p>
        <div class="form-actions">
          <label class="file-label">
            选择 TXT/CSV
            <input type="file" accept=".txt,.csv,text/plain,text/csv" onchange="importFromFile(this.files[0]); this.value=''" />
          </label>
          <button class="small-btn" onclick="submitBulkImport()">导入单词</button>
        </div>
      </div>
    </section>
  `;
}

function renderBook() {
  const cards = state.words
    .map(
      (word) => `
        <article class="book-item">
          <div class="book-main">
            <strong>${escapeHtml(word.es)}</strong>
            <span>${escapeHtml(word.cn)}</span>
            ${word.note ? `<small>${escapeHtml(word.note)}</small>` : ""}
          </div>
          <div class="book-actions">
            <button class="mini-btn" onclick="editWord('${word.id}')">改</button>
            <button class="mini-danger" onclick="deleteWord('${word.id}')">删</button>
          </div>
        </article>
      `
    )
    .join("");

  return `
    ${renderHero()}
    <div class="section-title"><span class="section-icon">🛒</span> 单词册</div>
    <div class="word-list">${cards || `<div class="panel empty">还没有单词，先去录入。</div>`}</div>
  `;
}

function renderCheckin() {
  const today = todayKey();
  const checked = Boolean(state.checkins[today]);
  const done = todaysDoneWords().length;
  return `
    ${renderHero()}
    <div class="section-title"><span class="section-icon">🏅</span> 每日打卡</div>
    <section class="post-card">
      <div class="post-body">
        <div class="post-title">
          今天完成 ${done} 个单词，连续打卡 ${streakCount()} 天。
          ${checked ? "今天已经盖章。" : "完成学习后就能盖章。"}
        </div>
        <div class="post-visual">${checked ? "✅" : "🌻"}</div>
      </div>
    </section>
    <button class="primary-btn" style="width:100%; margin-bottom:18px" onclick="checkIn()">${checked ? "今日已打卡" : "完成打卡"}</button>
    <div class="section-title"><span class="section-icon">🎖️</span> 荣誉殿堂</div>
    <div class="achievements">
      ${achievement("🎉", "第一颗单词", state.words.length >= 1)}
      ${achievement("🔥", "三连击", done >= 3)}
      ${achievement("⭐", "日达人", checked)}
      ${achievement("💯", "小坚持", streakCount() >= 3)}
    </div>
  `;
}

function achievement(icon, title, unlocked) {
  return `
    <div class="achievement" style="${unlocked ? "" : "opacity:.45"}">
      <div class="icon">${icon}</div>
      <strong>${title}</strong>
      <span>${unlocked ? "已点亮" : "继续努力"}</span>
    </div>
  `;
}

function renderTabbar() {
  const tabs = [
    ["learn", "📚", "背诵"],
    ["add", "🌱", "录入"],
    ["book", "🛒", "单词册"],
    ["checkin", "🏆", "打卡"],
  ];
  return `
    <nav class="tabbar">
      ${tabs
        .map(
          ([id, icon, label]) => `
          <button class="${state.activeTab === id ? "active" : ""}" onclick="switchTab('${id}')">
            <span class="tab-icon">${icon}</span>
            <span>${label}</span>
          </button>
        `
        )
        .join("")}
    </nav>
  `;
}

function renderPage() {
  if (state.activeTab === "add") return renderAdd();
  if (state.activeTab === "book") return renderBook();
  if (state.activeTab === "checkin") return renderCheckin();
  return renderLearn();
}

function render() {
  const coins = state.words.length * 10 + todaysDoneWords().length * 5;
  document.querySelector("#app").innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand"><span class="brand-icon">🍅</span><span>极简背单词</span></div>
        <div class="score-row">
          <span class="pill">🪙 ${coins}</span>
          <span class="pill">🏆 ${streakCount()}</span>
        </div>
      </header>
      ${renderPage()}
      ${renderTabbar()}
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    </main>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

render();
