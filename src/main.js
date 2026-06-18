/* ============================================================
   Eclipse — app entry + router.
   ============================================================ */

import './styles.css';
import { getState, subscribe, rolloverDaily, resetAll, update, setStorageKey, hydrate, onPersist } from './state.js';
import { authEnabled, getSession, onAuthChange, signUp, signIn, signOut, loadSave, queueSave } from './auth.js';
import { isoDate } from './util.js';
import { initStarfield } from './pixel/starfield.js';
import { renderHUD, applyTheme } from './hud.js';
import { warp, modal, toast, confirmModal } from './ui.js';
import { ensureMonth } from './rank.js';
import { normalizeSubjects } from './subjects.js';
import * as timer from './timerStore.js';

import { renderDashboard } from './views/dashboard.js';
import { renderTimer, cleanupTimer, finalizeSession } from './views/timer.js';
import { renderShop } from './views/shop.js';
import { renderSubjects } from './views/subjects.js';
import { renderOrbit } from './views/orbit.js';
import { renderProfile } from './views/profile.js';
import { renderSocial, cleanupSocial } from './views/social.js';
import { renderOnboarding } from './views/onboarding.js';
import { purgeForgedArt } from './collection.js';
import { processSessionEnd } from './session.js';
import * as social from './social.js';

// Initialize Vercel Web Analytics
import { inject } from '@vercel/analytics';

const VIEWS = {
  dashboard: { label: 'Home', icon: '🌒', render: renderDashboard },
  timer: { label: 'Timer', icon: '⏱️', render: renderTimer },
  subjects: { label: 'Subjects', icon: '📚', render: renderSubjects },
  orbit: { label: 'Orbit', icon: '🪐', render: renderOrbit },
  crew: { label: 'Friends', icon: '👥', render: renderSocial },
  shop: { label: 'Shop', icon: '🛒', render: renderShop },
  profile: { label: 'Profile', icon: '👤', render: renderProfile },
};

// Crew is cloud-only — drop the tab when Supabase isn't configured.
if (!social.socialEnabled()) delete VIEWS.crew;

let current = 'dashboard';

const viewEl = document.getElementById('view');
const navEl = document.getElementById('nav');

function navigate(name, { animate = true } = {}) {
  if (!VIEWS[name]) name = 'dashboard';
  if (name !== 'timer') cleanupTimer();
  current = name;
  if (animate) warp();
  renderView();
  renderNav();
  viewEl.scrollTop = 0;
  window.scrollTo(0, 0);
}

function renderView() {
  const ctx = { navigate, rerenderAll };
  cleanupTimer();
  cleanupSocial();
  viewEl.innerHTML = '';
  VIEWS[current].render(viewEl, ctx);
}

function renderNav() {
  navEl.innerHTML = Object.entries(VIEWS)
    .map(
      ([key, v]) => `<button class="nav-btn ${key === current ? 'active' : ''}" data-view="${key}">
        <span class="ico">${v.icon}</span>${v.label}
      </button>`
    )
    .join('');
  navEl.querySelectorAll('.nav-btn').forEach((b) =>
    b.addEventListener('click', () => navigate(b.dataset.view))
  );
}

/** Re-render HUD + current view + theme (after state changes). */
function rerenderAll() {
  applyTheme();
  renderHUD();
  renderView();
}

// ---- Live HUD: reflect timer ticks (running indicator) cheaply ----
let lastHudXp = null;
subscribe((s) => {
  // Only re-render HUD when user-facing numbers change.
  const key = `${s.user.xp}|${s.user.level}|${s.user.credits}|${s.user.streak}`;
  if (key !== lastHudXp) {
    lastHudXp = key;
    renderHUD();
  }
});

// ---- Broadcast study presence to friends on timer start/stop ----
// Fires only on transitions (not every tick): publishPresence runs when the
// running flag, subject, or session start changes.
let lastPresenceKey = null;
timer.subscribe((ts) => {
  if (!social.socialEnabled() || !social.getSocialUserId()) return;
  const key = ts.running ? `on|${ts.subject}|${ts.startedAt}` : 'off';
  if (key === lastPresenceKey) return;
  lastPresenceKey = key;
  social.publishPresence({ studying: ts.running, subject: ts.subject, startedAt: ts.startedAt });
});

// ---- Countdown auto-finalize (fires globally, not just on the Timer view) ----
// The store's ticker detects a countdown hitting zero even when the user is on
// another view; finalize it here so XP, the activity log, and the summary all
// happen exactly once regardless of where they are.
timer.setOnComplete((result) => finalizeSession(result, { completed: true }, () => rerenderAll()));

// ---- Settings via long-press / click on HUD avatar ----
function openSettings() {
  const s = getState();
  const closeSettings = modal(
    `<h2>Settings</h2>
     <label class="field"><span>Commander name</span><input type="text" id="set-name" value="${s.user.username.replace(/"/g, '&quot;')}" /></label>
     <label class="toggle-row"><input type="checkbox" id="set-focusfx" ${s.settings?.focusFx !== false ? 'checked' : ''} /> <span>Deep-space focus animations<br><small class="muted">Immersive star-warp + drifting comets, rockets &amp; supernovae while the timer runs.</small></span></label>
     <p class="muted center" style="font-size:10px;margin:4px 0 12px">Daily goals are set per subject in the Subjects tab.</p>
     ${authEnabled() ? `<div style="margin-bottom:8px"><button class="btn" id="set-logout" style="font-size:8px;width:100%">⏏ Log Out</button></div>` : ''}
     <div style="margin-top:8px"><button class="btn btn-red" id="set-reset" style="font-size:8px;width:100%">⚠ Reset All Progress</button></div>`,
    [
      { label: 'Cancel', className: 'btn-ghost', onClick: (c) => c() },
      {
        label: 'Save',
        className: 'btn-primary',
        onClick: (c) => {
          const name = document.getElementById('set-name').value.trim() || 'Cmdr. Cadet';
          const focusFx = document.getElementById('set-focusfx').checked;
          update((st) => {
            st.user.username = name;
            st.settings.focusFx = focusFx;
          });
          c();
          rerenderAll();
        },
      },
    ]
  );
  setTimeout(() => {
    document.getElementById('set-reset')?.addEventListener('click', async () => {
      const ok = await confirmModal('Wipe ALL progress, XP, cosmetics and subjects? This cannot be undone.', { okLabel: 'Erase', danger: true });
      if (ok) {
        timer.reset();
        resetAll();
        applyTheme();
        navigate('dashboard', { animate: false });
        toast('Fresh start, Cadet.');
      }
    });
    document.getElementById('set-logout')?.addEventListener('click', async () => {
      // Close settings, then sign out — onAuthChange shows the gate.
      closeSettings();
      timer.reset();
      await signOut();
    });
  }, 0);
}

// ---- Boot ----
async function boot() {
  initStarfield();
  applyTheme();
  renderHUD();
  
  // Initialize Vercel Web Analytics
  inject();

  // HUD avatar opens settings
  document.getElementById('hud').addEventListener('click', (e) => {
    if (e.target.closest('.hud-avatar')) openSettings();
  });

  if (authEnabled()) {
    // React to auth changes (incl. logout) for the whole session.
    onAuthChange((event) => {
      if (event === 'SIGNED_OUT') {
        social.clearSocialUser();
        lastPresenceKey = null;
        showEntry(true);
      }
    });
    const session = await getSession();
    if (session?.user) {
      await loadUser(session.user);
      startApp();
    } else {
      showEntry(true); // not signed in → onboarding wizard, account at the end
    }
  } else {
    // Local-only fallback (no Supabase configured): no accounts.
    startApp();
  }
}

/**
 * Show the onboarding/auth wizard.
 * @param {boolean} needsAccount  true when a visitor must create/log into an
 *   account at the end; false when they're already signed in (or local-only)
 *   and we just need their name + subjects.
 */
function showEntry(needsAccount) {
  timer.reset();
  if (needsAccount) onPersist(null); // not tied to a user yet
  document.body.classList.add('onboarding'); // chrome-hidden, centered layout
  renderHUD();
  renderOnboarding(viewEl, {
    needsAccount,
    onComplete: (draft) => { applyDraft(draft); startApp(); },
    onSignup: async (email, password, draft) => {
      const { data, error } = await signUp(email, password);
      if (error) return { error: error.message };
      if (!data.session) return { pending: true }; // email confirmation required
      await loadUser(data.session.user);
      applyDraft(draft);
      startApp();
      return {};
    },
    onLogin: async (email, password) => {
      const { data, error } = await signIn(email, password);
      if (error) return { error: error.message };
      await loadUser(data.session.user);
      startApp();
      return {};
    },
  });
}

/** Write the collected onboarding draft (name + subjects) into state. */
function applyDraft(draft) {
  update((st) => {
    st.user.username = draft.name || 'Cmdr. Cadet';
    st.subjects.push(...draft.subjects);
    st.onboarded = true;
  });
}

/** Point persistence at this user and pull their cloud save into memory. */
async function loadUser(user) {
  setStorageKey(`studyspace.v1.${user.id}`);
  social.setSocialUser(user.id);
  let data = null;
  try { data = await loadSave(user.id); } catch (e) { console.warn('Cloud load failed:', e.message); }
  hydrate(data || {}); // remote save, or a fresh default (triggers onboarding)
  // every persist now also syncs the cloud save AND the public crew profile
  onPersist((s) => { queueSave(user.id, s); social.syncProfile(); });
}

/** Daily/monthly housekeeping, then route to onboarding or the app. */
function startApp() {
  const today = isoDate();
  rolloverDaily(today);
  update((st) => {
    ensureMonth(st, today);
    normalizeSubjects(st);
    purgeForgedArt(st);
    // The old opt-in "Share today's activity" became the opt-out "Hide today's
    // activity" — carry a prior explicit opt-out across so nobody silently
    // starts sharing again.
    if (st.settings.shareActivity === false) st.settings.hideActivity = true;
    delete st.settings.shareActivity;
  });
  applyTheme();
  renderHUD();

  if (!getState().onboarded) {
    // Already signed in (or local-only) but no profile yet → collect name +
    // subjects, no account step.
    showEntry(false);
  } else {
    document.body.classList.remove('onboarding');
    renderNav();
    renderView();
  }
}

boot();

// expose for debugging in console
window.Eclipse = {
  getState,
  resetAll,
  navigate,
  /** Dev helper: grant Credits (and optionally levels) for testing. */
  grant(credits = 100, level = 0) {
    update((st) => {
      st.user.credits += credits;
      if (level) st.user.level += level;
    });
    rerenderAll();
    return getState().user.credits;
  },
  /** Dev helper: log a fake study session (minutes) to test goals/XP/levels. */
  study(subject, minutes = 60) {
    const end = Date.now();
    const summary = processSessionEnd(subject, end - minutes * 60000, end);
    rerenderAll();
    return summary;
  },
};
