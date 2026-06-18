(function () {
  const ALLOWED_DOMAIN = 'ultimatepromotions.co.uk';
  const state = {
    mode: window.location.pathname.includes('signup') ? 'signup' : 'login',
    submitting: false,
  };

  document.addEventListener('DOMContentLoaded', initAuthPage);

  function initAuthPage() {
    document.querySelectorAll('[data-auth-mode]').forEach((button) => {
      button.addEventListener('click', () => setMode(button.dataset.authMode));
    });

    document.getElementById('auth-login-form')?.addEventListener('submit', submitLogin);
    document.getElementById('auth-signup-form')?.addEventListener('submit', submitSignup);
    setMode(state.mode);
  }

  function setMode(mode) {
    state.mode = mode === 'signup' ? 'signup' : 'login';
    document.querySelectorAll('[data-auth-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.authMode === state.mode);
    });
    document.querySelectorAll('[data-auth-form]').forEach((form) => {
      form.classList.toggle('active', form.dataset.authForm === state.mode);
    });
    setStatus('');
    const url = new URL(window.location.href);
    const next = url.searchParams.get('next');
    const path = state.mode === 'signup' ? '/signup' : '/login';
    const suffix = next ? `?next=${encodeURIComponent(next)}` : '';
    window.history.replaceState(null, '', `${path}${suffix}`);
  }

  async function submitLogin(event) {
    event.preventDefault();
    if (state.submitting) return;
    const form = event.currentTarget;
    await submitAuth('/api/auth/login', {
      email: form.elements.email.value,
      password: form.elements.password.value,
    });
  }

  async function submitSignup(event) {
    event.preventDefault();
    if (state.submitting) return;
    const form = event.currentTarget;
    const email = String(form.elements.email.value || '').trim().toLowerCase();
    const password = String(form.elements.password.value || '');
    const confirmPassword = String(form.elements.confirm_password.value || '');

    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      setStatus(`Use an @${ALLOWED_DOMAIN} email address`, 'error');
      return;
    }
    if (password !== confirmPassword) {
      setStatus('Passwords do not match', 'error');
      return;
    }

    await submitAuth('/api/auth/signup', {
      first_name: form.elements.first_name.value,
      last_name: form.elements.last_name.value,
      email,
      password,
    });
  }

  async function submitAuth(endpoint, payload) {
    state.submitting = true;
    setDisabled(true);
    setStatus(endpoint.includes('signup') ? 'Creating account...' : 'Logging in...', 'info');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
      window.location.assign(nextUrl());
    } catch (err) {
      setStatus(err.message || 'Authentication failed', 'error');
    } finally {
      state.submitting = false;
      setDisabled(false);
    }
  }

  function setDisabled(disabled) {
    document.querySelectorAll('.auth-submit').forEach((button) => {
      button.disabled = disabled;
    });
  }

  function setStatus(message, tone = '') {
    const status = document.getElementById('auth-status');
    if (!status) return;
    status.textContent = message || '';
    status.dataset.tone = tone;
  }

  function nextUrl() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next') || '/';
    if (!next.startsWith('/') || next.startsWith('//')) return '/';
    return next;
  }
})();
