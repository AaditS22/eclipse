/* ============================================================
   Subjects view — define what you study and your daily time goal
   for each. Shows today's progress per subject, lets you add,
   edit, or remove subjects, and — whenever you decide a subject is
   finished — mark it complete to forge its commemorative relic.
   The relic's tier (Bronze → Ruby) comes from the total hours you
   logged on that subject.
   ============================================================ */

import { getState, update } from '../state.js';
import { fmtDuration, isoDate, escapeHtml } from '../util.js';
import { modal, toast, confirmModal, promptNewSubject, promptSubjectCompletion } from '../ui.js';
import { dailyProgress, totalDailyGoal, totalTodayMinutes, subjectTotalMinutes, undoCompleteInState } from '../subjects.js';
import { relicTierForMinutes, getRelicTier, artSVG, fitScale, RELIC_TIERS } from '../pixel/artgen.js';

export function renderSubjects(root, { rerenderAll }) {
  const s = getState();
  const today = isoDate();
  const prog = dailyProgress(s, today);
  const totalGoal = totalDailyGoal(s);
  const totalMins = totalTodayMinutes(s, today);
  const totalPct = totalGoal > 0 ? Math.min(1, totalMins / totalGoal) : 0;

  const active = s.subjects.filter((x) => !x.completedAt);

  root.innerHTML = `
    <section class="panel">
      <div class="between">
        <div class="panel-title" style="margin:0">My Subjects</div>
        <button class="btn btn-primary" id="sub-add" style="font-size:8px">+ Add Subject</button>
      </div>
      <div class="muted" style="font-size:11px;margin-top:8px">Set a daily time goal for each subject. Your progress resets every day — no streak loss, no nagging. When you've finished a subject, mark it complete to forge its relic.</div>
    </section>

    ${s.subjects.length === 0
      ? `<section class="panel center" style="padding:30px 16px">
           <div class="big-num" style="font-size:22px;margin-bottom:10px">🛰️</div>
           <div class="muted" style="font-size:12px;margin-bottom:16px">No subjects yet. Add the things you want to study and how long you'd like to spend on each per day.</div>
           <button class="btn btn-primary btn-lg" id="sub-add-empty">+ Add Your First Subject</button>
         </section>`
      : `<section class="panel">
           <div class="panel-title">Today's Progress</div>
           <div id="sub-progress"></div>
           <div class="total-row">
             <div class="between" style="margin-bottom:6px">
               <span class="pixel" style="font-size:10px">DAILY TOTAL</span>
               <span class="pixel" style="font-size:10px">${fmtDuration(totalMins)} / ${fmtDuration(totalGoal)}</span>
             </div>
             <div class="gauge"><div class="gauge-fill" style="width:${(totalPct * 100).toFixed(1)}%"></div></div>
           </div>
         </section>

         ${completedPanelHTML(s)}

         <section class="panel">
           <div class="panel-title">Manage</div>
           <div id="sub-list"></div>
         </section>`
    }
  `;

  root.querySelector('#sub-add')?.addEventListener('click', () => promptNewSubject(() => rerenderAll()));
  root.querySelector('#sub-add-empty')?.addEventListener('click', () => promptNewSubject(() => rerenderAll()));

  if (s.subjects.length > 0) {
    // Today's progress bars (active subjects only)
    const pbox = root.querySelector('#sub-progress');
    const activeProg = prog.filter((p) => active.some((a) => a.id === p.id));
    pbox.innerHTML = (activeProg.length ? activeProg : prog)
      .map(
        (p) => `<div class="subject-prog">
          <div class="sp-head">
            <span class="swatch" style="width:10px;height:10px;background:${p.color}"></span>
            <span class="sp-name">${escapeHtml(p.name)}${p.done ? ' <span style="color:var(--green)">✓</span>' : ''}</span>
            <span class="sp-nums muted">${fmtDuration(p.mins)}${p.goal > 0 ? ` / ${fmtDuration(p.goal)}` : ''}</span>
          </div>
          <div class="q-bar"><div class="q-fill" style="width:${(p.pct * 100).toFixed(0)}%;background:${p.done ? 'var(--green)' : p.color}"></div></div>
        </div>`
      )
      .join('');

    // Editable list
    const list = root.querySelector('#sub-list');
    list.innerHTML = s.subjects
      .map((sub) => {
        const tier = sub.completedAt ? getRelicTier(sub.completedTier) : relicTierForMinutes(subjectTotalMinutes(s, sub.name));
        const totalH = (subjectTotalMinutes(s, sub.name) / 60).toFixed(1).replace(/\.0$/, '');
        const meta = sub.completedAt
          ? `<span style="color:${tier.color}">🏆 ${tier.label}</span> · done ${sub.completedAt}`
          : `${sub.dailyGoalMinutes ? fmtDuration(sub.dailyGoalMinutes) + '/day' : 'no goal'} · ${totalH}h logged`;
        return `<div class="mission${sub.completedAt ? ' completed' : ''}">
          <div class="swatch" style="background:${sub.completedAt ? tier.color : sub.color}"></div>
          <div class="m-sub">${escapeHtml(sub.name)}</div>
          <div class="muted" style="font-size:11px">${meta}</div>
          ${sub.completedAt
            ? `<button class="btn btn-ghost" data-undo="${sub.id}" style="font-size:7px">↺ Undo</button>`
            : `<button class="btn btn-green" data-complete="${sub.id}" style="font-size:7px">✓ Complete</button>`}
          <button class="btn btn-ghost" data-edit="${sub.id}" style="font-size:7px">Edit</button>
          <button class="btn btn-ghost" data-del="${sub.id}" style="font-size:7px">✕</button>
        </div>`;
      })
      .join('');

    list.querySelectorAll('button[data-complete]').forEach((b) =>
      b.addEventListener('click', () => completeSubject(b.dataset.complete, rerenderAll))
    );
    list.querySelectorAll('button[data-undo]').forEach((b) =>
      b.addEventListener('click', () => undoSubject(b.dataset.undo, rerenderAll))
    );
    list.querySelectorAll('button[data-edit]').forEach((b) =>
      b.addEventListener('click', () => editSubject(b.dataset.edit, rerenderAll))
    );
    list.querySelectorAll('button[data-del]').forEach((b) =>
      b.addEventListener('click', () => deleteSubject(b.dataset.del, rerenderAll))
    );
  }
}

/** "Completed Subjects" panel: the relics you've earned, coloured by tier. */
function completedPanelHTML(s) {
  const done = s.subjects.filter((x) => x.completedAt);
  if (done.length === 0) {
    return `<section class="panel">
      <div class="panel-title">Completed Subjects</div>
      <div class="muted" style="font-size:11px">Finished a subject? Hit <b>✓ Complete</b> below to forge a one-of-a-kind <b>commemorative relic</b>. Its tier — ${RELIC_TIERS.map((t) => t.label).join(' → ')} — is set by the total hours you logged on it.</div>
    </section>`;
  }
  const rows = done
    .map((sub) => {
      const tier = getRelicTier(sub.completedTier);
      const relic = s.user.collection?.find((p) => p.id === sub.relicId);
      const hrs = (subjectTotalMinutes(s, sub.name) / 60).toFixed(1).replace(/\.0$/, '');
      return `<div class="relic-row">
        <div class="relic-row-art" style="filter:drop-shadow(0 0 6px ${tier.color}80)">${relic ? artSVG(relic, fitScale(relic, 40)) : '🏆'}</div>
        <div class="relic-row-body">
          <div class="sp-name">${escapeHtml(sub.name)}</div>
          <div class="muted" style="font-size:10px">${hrs}h · completed ${sub.completedAt}</div>
        </div>
        <div class="relic-row-tier pixel" style="color:${tier.color};border-color:${tier.color}">${tier.label}</div>
      </div>`;
    })
    .join('');
  return `<section class="panel">
    <div class="panel-title">🏆 Completed Subjects · ${done.length}</div>
    <div class="muted" style="font-size:11px;margin-bottom:12px">Each relic is yours forever — view them all in the Shop.</div>
    ${rows}
  </section>`;
}

/** Mark a subject complete → forge its tiered, space-themed relic. */
function completeSubject(id, rerenderAll) {
  const sub = getState().subjects.find((x) => x.id === id);
  if (!sub || sub.completedAt) return;
  promptSubjectCompletion(sub.name, () => rerenderAll());
}

/** Reopen a completed subject, removing its relic. */
async function undoSubject(id, rerenderAll) {
  const sub = getState().subjects.find((x) => x.id === id);
  if (!sub || !sub.completedAt) return;
  const ok = await confirmModal(
    `Reopen "${escapeHtml(sub.name)}"? This <b>permanently removes its relic</b> and lets you log sessions to it again.`,
    { okLabel: 'Reopen & remove relic', danger: true }
  );
  if (!ok) return;
  update((st) => undoCompleteInState(st, id));
  toast(`${sub.name} reopened — relic removed.`);
  rerenderAll();
}

function editSubject(id, rerenderAll) {
  const sub = getState().subjects.find((x) => x.id === id);
  if (!sub) return;
  modal(
    `<h2>Edit Subject</h2>
     <label class="field"><span>Subject name</span><input type="text" id="es-name" value="${escapeHtml(sub.name)}" /></label>
     <label class="field"><span>Daily goal (minutes)</span><input type="number" id="es-goal" min="0" step="15" value="${sub.dailyGoalMinutes}" /></label>
     ${sub.completedAt ? `<p class="muted center" style="font-size:10px;margin:-4px 0 8px;color:${getRelicTier(sub.completedTier).color}">🏆 Completed ${sub.completedAt} — ${getRelicTier(sub.completedTier).label} relic minted.</p>` : ''}`,
    [
      { label: 'Cancel', className: 'btn-ghost', onClick: (c) => c() },
      {
        label: 'Save',
        className: 'btn-primary',
        onClick: (c) => {
          const name = document.getElementById('es-name').value.trim();
          const goal = Math.max(0, parseInt(document.getElementById('es-goal').value, 10) || 0);
          if (!name) { toast('Enter a subject name.'); return; }
          update((st) => {
            const target = st.subjects.find((x) => x.id === id);
            // If the name changed, re-point existing sessions so history stays attached.
            if (target.name !== name) {
              for (const ses of st.sessions) if (ses.subject === target.name) ses.subject = name;
            }
            target.name = name;
            target.dailyGoalMinutes = goal;
          });
          c();
          rerenderAll();
        },
      },
    ]
  );
}

async function deleteSubject(id, rerenderAll) {
  const sub = getState().subjects.find((x) => x.id === id);
  if (!sub) return;
  const ok = await confirmModal(
    `Remove "${escapeHtml(sub.name)}"? Your logged sessions, XP, and any earned relic are kept — it just stops appearing in your daily goals.`,
    { okLabel: 'Remove', danger: true }
  );
  if (!ok) return;
  update((st) => {
    st.subjects = st.subjects.filter((x) => x.id !== id);
  });
  toast('Subject removed.');
  rerenderAll();
}
