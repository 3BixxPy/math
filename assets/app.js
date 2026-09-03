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

  // Wires up the "mark this chapter done" card at the bottom of a chapter
  // page. `key` is this chapter's own day key (e.g. "m00:5") — independent
  // of whatever the dashboard currently shows, so chapters can be marked
  // in any order and any number per day (the streak itself still only
  // advances once per calendar day, however many get marked — that's
  // handled in markDayComplete, not here, so it never needs to block you).
  async function initChapterDone(key, chapterFile) {
    const container = document.getElementById("chapter-done-card");
    if (!container) return;
    const state = load();
    let concepts = [];
    try {
      concepts = (await fetchJSON("../../data/concepts.json")).concepts;
    } catch (e) {
      // offline/local file:// — degrade gracefully, spaced review just won't seed from here
    }

    function render() {
      const entry = state.completedDays[key];
      if (entry) {
        container.innerHTML =
          '<div class="card"><p><strong>✓ Chapter marked done</strong> <span class="subtitle">— ' + entry.date + "</span></p></div>";
        return;
      }
      container.innerHTML =
        '<div class="card">' +
          '<p class="subtitle">Done with this chapter?</p>' +
          '<div class="row" style="margin:.4rem 0 .8rem;"><label class="row" style="gap:.4rem;"><input type="checkbox" id="chapter-bonus-check"> I also did the bonus/challenge</label></div>' +
          '<button class="btn" id="chapter-done-btn" type="button">Mark this chapter done ✓</button>' +
        "</div>";
      document.getElementById("chapter-done-btn").addEventListener("click", () => {
        const gotBonus = document.getElementById("chapter-bonus-check").checked;
        markDayComplete(state, key, gotBonus);
        introduceConceptsForFile(state, concepts, chapterFile);
        save(state);
        render();
      });
    }
    render();
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

  // ---- instant-check widgets: type an answer, get feedback, no backend ----
  function normalizeAnswer(s) {
    return String(s).trim().toLowerCase().replace(/\s+/g, "").replace(/^\+/, "");
  }

  function initCheckers(root) {
    const boxes = (root || document).querySelectorAll(".checker");
    boxes.forEach((box) => {
      const input = box.querySelector(".checker-input");
      const btn = box.querySelector(".checker-btn");
      const feedback = box.querySelector(".checker-feedback");
      if (!input || !btn || !feedback) return;
      const accepted = (box.dataset.answers || "").split(",").map(normalizeAnswer).filter(Boolean);
      const tolerance = box.dataset.tolerance !== undefined ? parseFloat(box.dataset.tolerance) : null;

      function check() {
        const norm = normalizeAnswer(input.value);
        if (!norm) return;
        let correct = accepted.includes(norm);
        if (!correct && tolerance !== null && !isNaN(parseFloat(norm))) {
          const val = parseFloat(norm);
          correct = accepted.some((a) => !isNaN(parseFloat(a)) && Math.abs(parseFloat(a) - val) <= tolerance);
        }
        if (correct) {
          feedback.textContent = "✓ Correct.";
          feedback.style.color = "var(--ex-border)";
          input.disabled = true;
          btn.disabled = true;
          box.classList.add("checker-solved");
        } else {
          feedback.textContent = "Not quite — try again.";
          feedback.style.color = "var(--mis-border)";
        }
      }
      btn.addEventListener("click", check);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") check();
      });
    });
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
    completedCount,
    totalAuthoredDays,
    markDayComplete,
    initChapterDone,
    introduceConcept,
    introduceConceptsForFile,
    reviewResult,
    dueConcepts,
    resolveEquation,
    exportState,
    importState,
    initCheckers,
    renderMath
  };
})();
