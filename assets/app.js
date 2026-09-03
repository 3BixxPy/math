/* =========================================================================
   Math Curriculum — app engine
   localStorage-backed progress, streak tracking, Leitner-box spaced
   repetition, and KaTeX render helper. Pure vanilla JS, no dependencies.
   ========================================================================= */

const MC = (() => {
  const LS_KEY = "mathcurr_state_v1";
  const BOX_INTERVAL_DAYS = [1, 1, 3, 7, 16, 35]; // index = box (1..5), 0 unused

  function defaultState() {
    return {
      completedDays: {},                          // "m00:1" -> { date, bonus }
      streak: { count: 0, longest: 0, lastDate: null },
      leitner: {}                                  // conceptId -> { box, due }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) {
      console.warn("MC: could not read saved progress, starting fresh.", e);
      return defaultState();
    }
  }

  function save(state) {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(iso, n) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  async function fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error("Failed to load " + path);
    return res.json();
  }

  function flattenDays(curriculum) {
    const out = [];
    for (const m of curriculum.modules) {
      for (const d of m.days || []) {
        out.push({
          key: m.id + ":" + d.day,
          moduleId: m.id,
          moduleNumber: m.number,
          moduleTitle: m.title,
          moduleFolder: m.folder,
          day: d.day,
          file: d.file,
          title: d.title,
          core: d.core,
          bonus: d.bonus
        });
      }
    }
    return out;
  }

  function nextUpEntry(curriculum, state) {
    for (const entry of flattenDays(curriculum)) {
      if (!state.completedDays[entry.key]) return entry;
    }
    return null;
  }

  function completedCount(state) {
    return Object.keys(state.completedDays).length;
  }

  function totalAuthoredDays(curriculum) {
    return flattenDays(curriculum).length;
  }

  function markDayComplete(state, key, gotBonus) {
    const today = todayISO();
    state.completedDays[key] = { date: today, bonus: !!gotBonus };
    if (state.streak.lastDate === today) {
      // already counted today, nothing to change on the streak itself
    } else if (state.streak.lastDate === addDays(today, -1)) {
      state.streak.count += 1;
    } else {
      state.streak.count = 1;
    }
    state.streak.lastDate = today;
    if (state.streak.count > state.streak.longest) state.streak.longest = state.streak.count;
    save(state);
    return state;
  }

  // ---- Leitner spaced repetition ----
  function introduceConcept(state, conceptId) {
    if (state.leitner[conceptId]) return;
    state.leitner[conceptId] = { box: 1, due: todayISO() };
  }

  function introduceConceptsForFile(state, concepts, chapterFile) {
    const short = chapterFile.split("/").pop();
    for (const c of concepts) {
      if (c.definedIn && c.definedIn.endsWith(short)) introduceConcept(state, c.id);
    }
  }

  function reviewResult(state, conceptId, remembered) {
    const entry = state.leitner[conceptId] || { box: 1, due: todayISO() };
    entry.box = remembered ? Math.min(entry.box + 1, 5) : 1;
    entry.due = addDays(todayISO(), BOX_INTERVAL_DAYS[entry.box]);
    state.leitner[conceptId] = entry;
    save(state);
  }

  function dueConcepts(state, concepts) {
    const today = todayISO();
    return concepts.filter((c) => {
      const entry = state.leitner[c.id];
      return entry && entry.due <= today;
    });
  }

  // ---- equation-number resolver: "M.C.N" -> path#anchor ----
  // Works because each module's day N == chapter N (one chapter per learning-day).
  function resolveEquation(curriculum, eqRef) {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(eqRef.trim());
    if (!m) return null;
    const [, modNum, chNum, eqNum] = m;
    const mod = curriculum.modules.find((x) => String(x.number) === modNum);
    if (!mod) return null;
    const day = (mod.days || []).find((d) => String(d.day) === chNum);
    if (!day) return null;
    return {
      path: mod.folder + "/" + day.file,
      anchor: "eq-" + modNum + "-" + chNum + "-" + eqNum,
      title: day.title
    };
  }

  // ---- export / import progress (phone <-> PC sync, no backend) ----
  function exportState(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "math-curriculum-progress-" + todayISO() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importState(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const merged = Object.assign(defaultState(), parsed);
        save(merged);
        cb(null, merged);
      } catch (e) {
        cb(e);
      }
    };
    reader.onerror = () => cb(reader.error);
    reader.readAsText(file);
  }

  function renderMath(root) {
    if (window.renderMathInElement) {
      window.renderMathInElement(root || document.body, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false }
        ],
        throwOnError: false
      });
    }
  }

  return {
    LS_KEY,
    load,
    save,
    todayISO,
    addDays,
    fetchJSON,
    flattenDays,
    nextUpEntry,
    completedCount,
    totalAuthoredDays,
    markDayComplete,
    introduceConcept,
    introduceConceptsForFile,
    reviewResult,
    dueConcepts,
    resolveEquation,
    exportState,
    importState,
    renderMath
  };
})();
