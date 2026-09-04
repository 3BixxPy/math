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

  // Undo a mark-done. Deliberately simple: only removes the completedDays
  // entry (so progress counts and roadmap/dashboard immediately reflect
  // it). Doesn't try to retroactively unwind the streak counter or pull
  // the chapter's concepts back out of spaced review — both would need
  // full history to do correctly, and this is meant for the rare "marked
  // that by mistake" case, not routine use.
  function unmarkDayComplete(state, key) {
    delete state.completedDays[key];
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
          '<div class="card"><p><strong>✓ Chapter marked done</strong> <span class="subtitle">— ' + entry.date + '</span></p>' +
          '<p style="margin-top:.5rem;"><a href="#" id="chapter-unmark-link" style="font-size:.8rem; color:var(--text-dim);">marked this by mistake? unmark it</a></p></div>';
        document.getElementById("chapter-unmark-link").addEventListener("click", (e) => {
          e.preventDefault();
          unmarkDayComplete(state, key);
          render();
        });
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

  // Wires up the "ask an AI about this page" card. Reads the page's own
  // <main> at click time (so it's always in sync with the rendered
  // content, no separate context to author or keep updated), builds a
  // short prompt, and both copies it to the clipboard AND opens it via
  // URL query param — the clipboard copy is a deliberate fallback in
  // case a given AI's prefill-via-URL behavior changes or isn't
  // supported, so the button stays useful either way.
  function initAskAi(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    function buildPrompt() {
      const root = document.querySelector("main") || document.querySelector("article") || document.body;
      const pageText = root.innerText.trim().slice(0, 1800);
      return (
        'I\'m studying "' + document.title + '" from my personal math curriculum. ' +
        "Here's the page content:\n\n" + pageText +
        "\n\nHelp me understand it, or answer my question about it."
      );
    }

    async function ask(urlPrefix, statusEl) {
      const prompt = buildPrompt();
      let copied = false;
      try {
        await navigator.clipboard.writeText(prompt);
        copied = true;
      } catch (e) {
        // clipboard API can be unavailable (permissions, insecure context) —
        // the URL prefill below is still attempted regardless
      }
      window.open(urlPrefix + encodeURIComponent(prompt), "_blank", "noopener");
      if (statusEl) {
        statusEl.textContent = copied
          ? "Prompt copied to your clipboard too — paste it if it doesn't show up pre-filled."
          : "Opened in a new tab.";
      }
    }

    // Official logomarks, inline (no external request): OpenAI's interlocking
    // knot and Google Gemini's four-point sparkle. fill="currentColor" so
    // each just picks up the button's own (white) text color.
    const openaiIcon =
      '<svg class="ai-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.0195 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4940 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0195 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.4592a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>';
    const geminiIcon =
      '<svg class="ai-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M12 24A14.304 14.304 0 0 0 0 12 14.304 14.304 0 0 0 12 0a14.305 14.305 0 0 0 12 12 14.305 14.305 0 0 0-12 12"/></svg>';

    container.innerHTML =
      '<div class="card">' +
        '<p class="subtitle">Stuck on something here? Send this page as context to an AI chat.</p>' +
        '<div class="row" style="margin-top:.5rem;">' +
          '<button class="btn ai-btn ai-btn-chatgpt" id="ask-chatgpt-btn" type="button">' + openaiIcon + " Ask ChatGPT</button>" +
          '<button class="btn ai-btn ai-btn-gemini" id="ask-gemini-btn" type="button">' + geminiIcon + " Ask Gemini</button>" +
        "</div>" +
        '<p class="subtitle" id="ask-ai-status" style="margin-top:.5rem;"></p>' +
      "</div>";

    const statusEl = document.getElementById("ask-ai-status");
    document.getElementById("ask-chatgpt-btn").addEventListener("click", () => {
      ask("https://chatgpt.com/?q=", statusEl);
    });
    document.getElementById("ask-gemini-btn").addEventListener("click", () => {
      ask("https://gemini.google.com/app?q=", statusEl);
    });
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
      const accepted = (box.dataset.answers || "").split("|").map(normalizeAnswer).filter(Boolean);
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
    unmarkDayComplete,
    initChapterDone,
    initAskAi,
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
