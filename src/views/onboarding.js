/* ============================================================
   First-run flow — a themed, centered wizard:
     1. Name      ("what should we call you?")
     2. Subjects  (+ daily goals)
     3. Account   (create one to save progress) — only when accounts
                   are enabled AND the visitor isn't already signed in
   A "Log in" link is offered from the start so returning users can
   jump straight to the login screen instead of re-onboarding.

   The wizard only COLLECTS a draft; the caller decides what to do via
   callbacks (onComplete / onSignup / onLogin), keeping auth logic out
   of the view.
   ============================================================ */

import { makeSubject } from '../subjects.js';
import { eclipseLogoSVG } from '../pixel/sprites.js';
import { escapeHtml } from '../util.js';
import { toast } from '../ui.js';

/**
 * @param {HTMLElement} root
 * @param {object} opts
 * @param {boolean} opts.needsAccount   show the account-creation step + login link
 * @param {(draft)=>void} opts.onComplete            finish without an account (local / already signed in)
 * @param {(email,pw,draft)=>Promise<{error?,pending?}>} opts.onSignup
 * @param {(email,pw)=>Promise<{error?}>} opts.onLogin
 */
export function renderOnboarding(root, opts = {}) {
  const { needsAccount = false, onComplete, onSignup, onLogin } = opts;
  const draft = { name: '', subjects: [] };
  let step = 'name';
  let busy = false;

  const order = needsAccount ? ['name', 'subjects', 'account'] : ['name', 'subjects'];

  const dots = () =>
    step === 'login'
      ? ''
      : `<div class="onboard-dots">${order.map((s) => `<span class="${s === step ? 'on' : ''}"></span>`).join('')}</div>`;

  const header = (tagline) => `
    <div class="onboard-logo">${eclipseLogoSVG(7)}</div>
    <div class="eclipse-wordmark center">ECLIPSE</div>
    <div class="eclipse-tagline center" style="margin-bottom:16px">${tagline}</div>`;

  function render() {
    ({ name: renderName, subjects: renderSubjects, account: renderAccount, login: renderLogin }[step])();
  }

  /* ---- Step 1: name ---- */
  function renderName() {
    root.innerHTML = `
      <div class="onboard">
        <div class="onboard-card panel">
          ${header('Focus is the mission.')}
          <p class="muted center" style="font-size:12px;margin-bottom:14px">Welcome, astronaut. What should we call you?</p>
          <label class="field"><span>Commander name</span>
            <input type="text" id="ob-name" placeholder="e.g. Stardust" autocomplete="off" maxlength="24" value="${escapeHtml(draft.name)}" />
          </label>
          <button class="btn btn-primary btn-lg" id="ob-next" style="width:100%;margin-top:6px">Continue →</button>
          ${needsAccount ? `<div class="auth-switch muted">Already have an account? <button class="btn-link" id="ob-tologin">Log in</button></div>` : ''}
          ${dots()}
        </div>
      </div>`;
    const input = root.querySelector('#ob-name');
    const go = () => {
      draft.name = input.value.trim();
      if (!draft.name) { toast('Enter a name to continue.'); input.focus(); return; }
      step = 'subjects'; render();
    };
    root.querySelector('#ob-next').onclick = go;
    root.querySelector('#ob-tologin')?.addEventListener('click', () => { step = 'login'; render(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => input.focus(), 50);
  }

  /* ---- Step 2: subjects ---- */
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
          <button class="btn btn-primary btn-lg" id="ob-done" style="width:100%;margin-top:14px">${needsAccount ? 'Continue →' : 'Enter Eclipse →'}</button>
          <button class="btn btn-ghost" id="ob-back" style="width:100%;margin-top:6px;font-size:8px">← Back</button>
          ${dots()}
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
      if (draft.subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) { toast('That subject is already on the list.'); return; }
      const goal = Math.max(0, parseInt(root.querySelector('#ob-goal').value, 10) || 0);
      draft.subjects.push(makeSubject(name, goal, draft.subjects.length));
      input.value = '';
      input.focus();
      renderChips();
    };

    root.querySelector('#ob-add').onclick = add;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    root.querySelector('#ob-back').onclick = () => { step = 'name'; render(); };
    root.querySelector('#ob-done').onclick = () => {
      if (draft.subjects.length === 0) { toast('Add at least one subject first.'); input.focus(); return; }
      if (needsAccount) { step = 'account'; render(); }
      else onComplete?.(draft);
    };
    renderChips();
    setTimeout(() => input.focus(), 50);
  }

  /* ---- Step 3: create account ---- */
  function renderAccount() {
    root.innerHTML = `
      <div class="onboard">
        <div class="onboard-card panel">
          ${header('Last step, Commander.')}
          <p class="muted center" style="font-size:12px;margin-bottom:14px">Create an account so your progress saves and follows you across devices.</p>
          <label class="field"><span>Email</span>
            <input type="email" id="ac-email" autocomplete="email" placeholder="you@example.com" />
          </label>
          <label class="field"><span>Password</span>
            <input type="password" id="ac-pass" autocomplete="new-password" placeholder="At least 6 characters" />
          </label>
          <div id="ac-msg" class="auth-msg"></div>
          <button class="btn btn-primary btn-lg" id="ac-submit" style="width:100%;margin-top:2px">Launch 🚀</button>
          <button class="btn btn-ghost" id="ac-back" style="width:100%;margin-top:6px;font-size:8px">← Back</button>
          <div class="auth-switch muted">Already have an account? <button class="btn-link" id="ac-tologin">Log in</button></div>
          ${dots()}
        </div>
      </div>`;
    wireCredentials({
      emailId: 'ac-email', passId: 'ac-pass', msgId: 'ac-msg', submitId: 'ac-submit',
      label: 'Launch 🚀', minPass: 6,
      action: (email, pass) => onSignup(email, pass, draft),
      onPending: (setMsg) => { setMsg('Account created! Confirm via the email we sent, then log in.', 'ok'); setTimeout(() => { step = 'login'; render(); }, 2200); },
    });
    root.querySelector('#ac-back').onclick = () => { step = 'subjects'; render(); };
    root.querySelector('#ac-tologin').onclick = () => { step = 'login'; render(); };
  }

  /* ---- Login (alternate branch) ---- */
  function renderLogin() {
    root.innerHTML = `
      <div class="onboard">
        <div class="onboard-card panel">
          ${header('Welcome back.')}
          <p class="muted center" style="font-size:12px;margin-bottom:14px">Log in to pick up where you left off.</p>
          <label class="field"><span>Email</span>
            <input type="email" id="lg-email" autocomplete="email" placeholder="you@example.com" />
          </label>
          <label class="field"><span>Password</span>
            <input type="password" id="lg-pass" autocomplete="current-password" placeholder="••••••••" />
          </label>
          <div id="lg-msg" class="auth-msg"></div>
          <button class="btn btn-primary btn-lg" id="lg-submit" style="width:100%;margin-top:2px">Log in →</button>
          <div class="auth-switch muted">New here? <button class="btn-link" id="lg-tostart">Start fresh</button></div>
        </div>
      </div>`;
    wireCredentials({
      emailId: 'lg-email', passId: 'lg-pass', msgId: 'lg-msg', submitId: 'lg-submit',
      label: 'Log in →', minPass: 1,
      action: (email, pass) => onLogin(email, pass),
    });
    root.querySelector('#lg-tostart').onclick = () => { step = 'name'; render(); };
  }

  // Shared email/password submit wiring for the account + login forms.
  function wireCredentials({ emailId, passId, msgId, submitId, label, minPass, action, onPending }) {
    const email = root.querySelector('#' + emailId);
    const pass = root.querySelector('#' + passId);
    const msg = root.querySelector('#' + msgId);
    const submit = root.querySelector('#' + submitId);
    const setMsg = (t, kind = 'err') => { msg.innerHTML = t; msg.className = `auth-msg ${kind}`; };

    const go = async () => {
      if (busy) return;
      const e = email.value.trim();
      const p = pass.value;
      if (!e || !p) { setMsg('Enter your email and password.'); return; }
      if (p.length < minPass) { setMsg('Password must be at least 6 characters.'); return; }
      busy = true; submit.disabled = true; submit.textContent = 'Working…'; setMsg('', '');
      try {
        const res = (await action(e, p)) || {};
        if (res.error) { setMsg(res.error); reset(); }
        else if (res.pending && onPending) { onPending(setMsg); reset(); }
        // success: the app has navigated away; nothing to do.
      } catch (err) {
        setMsg(err?.message || 'Something went wrong. Try again.'); reset();
      }
    };
    const reset = () => { busy = false; submit.disabled = false; submit.innerHTML = label; };

    submit.onclick = go;
    [email, pass].forEach((el) => el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); }));
    setTimeout(() => email.focus(), 50);
  }

  render();
}
