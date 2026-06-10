/* ============================================================
   First-run onboarding — a small two-step start page (not a modal,
   not a giant form). Step 1: your name. Step 2: add the subjects
   you're studying. Then it drops you into the app. Shown only when
   `state.onboarded` is false, so it never appears on later visits.
   ============================================================ */

import { getState, update } from '../state.js';
import { makeSubject } from '../subjects.js';
import { eclipseLogoSVG } from '../pixel/sprites.js';
import { escapeHtml } from '../util.js';
import { toast } from '../ui.js';

/**
 * Render the onboarding flow into `root`.
 * @param {HTMLElement} root
 * @param {() => void} onComplete  called once the user enters the app
 */
export function renderOnboarding(root, onComplete) {
  let step = 1;
  const existing = getState().user.username;
  const draft = {
    name: existing && existing !== 'Cmdr. Cadet' ? existing : '',
    subjects: [], // makeSubject() records
  };

  function render() {
    if (step === 1) renderName();
    else renderSubjects();
  }

  // ---- Step 1: name ----
  function renderName() {
    root.innerHTML = `
      <div class="onboard">
        <div class="onboard-card panel">
          <div class="onboard-logo">${eclipseLogoSVG(7)}</div>
          <div class="eclipse-wordmark center">ECLIPSE</div>
          <div class="eclipse-tagline center" style="margin-bottom:18px">Focus is the mission.</div>
          <p class="muted center" style="font-size:12px;margin-bottom:14px">Welcome, astronaut. What should we call you?</p>
          <label class="field"><span>Commander name</span>
            <input type="text" id="ob-name" placeholder="e.g. Stardust" autocomplete="off" maxlength="24" value="${escapeHtml(draft.name)}" />
          </label>
          <button class="btn btn-primary btn-lg" id="ob-next" style="width:100%;margin-top:6px">Continue →</button>
          <div class="onboard-dots"><span class="on"></span><span></span></div>
        </div>
      </div>`;

    const input = root.querySelector('#ob-name');
    const go = () => {
      draft.name = input.value.trim();
      if (!draft.name) { toast('Enter a name to continue.'); input.focus(); return; }
      step = 2;
      render();
    };
    root.querySelector('#ob-next').onclick = go;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => input.focus(), 50);
  }

  // ---- Step 2: subjects ----
  function renderSubjects() {
    root.innerHTML = `
      <div class="onboard">
        <div class="onboard-card panel">
          <div class="panel-title center" style="margin-bottom:4px">What are you studying, ${escapeHtml(draft.name)}?</div>
          <p class="muted center" style="font-size:11px;margin-bottom:14px">Add a few subjects and a daily goal for each. You can change these anytime.</p>
          <div class="onboard-add">
            <input type="text" id="ob-subj" placeholder="Subject (e.g. Calculus)" autocomplete="off" maxlength="40" />
            <input type="number" id="ob-goal" min="0" step="15" value="60" aria-label="Daily goal in minutes" title="Daily goal (minutes)" />
            <button class="btn btn-green" id="ob-add">+ Add</button>
          </div>
          <div class="muted center" style="font-size:10px;margin:-4px 0 10px">↑ subject &amp; minutes-per-day goal</div>
          <div id="ob-chips" class="onboard-chips"></div>
          <button class="btn btn-primary btn-lg" id="ob-done" style="width:100%;margin-top:14px">Enter Eclipse →</button>
          <button class="btn btn-ghost" id="ob-back" style="width:100%;margin-top:6px;font-size:8px">← Back</button>
          <div class="onboard-dots"><span></span><span class="on"></span></div>
        </div>
      </div>`;

    const input = root.querySelector('#ob-subj');
    const chips = root.querySelector('#ob-chips');

    const renderChips = () => {
      chips.innerHTML = draft.subjects.length
        ? draft.subjects
            .map((s, i) => `<span class="onboard-chip" style="border-color:${s.color}">
                <span class="swatch" style="width:8px;height:8px;background:${s.color}"></span>${escapeHtml(s.name)}
                <span class="muted" style="font-size:9px">${s.dailyGoalMinutes}m</span>
                <button data-rm="${i}" aria-label="Remove">✕</button>
              </span>`)
            .join('')
        : `<p class="muted center" style="font-size:10px;margin:6px 0">No subjects yet — add at least one to begin.</p>`;
      chips.querySelectorAll('button[data-rm]').forEach((b) =>
        b.addEventListener('click', () => { draft.subjects.splice(Number(b.dataset.rm), 1); renderChips(); })
      );
    };

    const add = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      if (draft.subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        toast('That subject is already on the list.');
        return;
      }
      const goal = Math.max(0, parseInt(root.querySelector('#ob-goal').value, 10) || 0);
      draft.subjects.push(makeSubject(name, goal, draft.subjects.length));
      input.value = '';
      input.focus();
      renderChips();
    };

    root.querySelector('#ob-add').onclick = add;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    root.querySelector('#ob-back').onclick = () => { step = 1; render(); };

    root.querySelector('#ob-done').onclick = () => {
      if (draft.subjects.length === 0) { toast('Add at least one subject first.'); input.focus(); return; }
      update((st) => {
        st.user.username = draft.name || 'Cmdr. Cadet';
        st.subjects.push(...draft.subjects);
        st.onboarded = true;
      });
      onComplete?.();
    };

    renderChips();
    setTimeout(() => input.focus(), 50);
  }

  render();
}
