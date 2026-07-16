(function () {
  const state = {
    mode: window.location.pathname.includes('signup') ? 'signup' : 'login',
    submitting: false,
    signupReceived: false,
  };

  document.addEventListener('DOMContentLoaded', initAuthPage);

  function initAuthPage() {
    document.querySelectorAll('[data-auth-mode]').forEach((button) => {
      button.addEventListener('click', () => setMode(button.dataset.authMode));
    });

    document.getElementById('auth-login-form')?.addEventListener('submit', submitLogin);
    document.getElementById('auth-signup-form')?.addEventListener('submit', submitSignup);
    document.querySelector('[data-auth-return-login]')?.addEventListener('click', () => {
      state.signupReceived = false;
      setMode('login');
    });
    setMode(state.mode);
  }

  function setMode(mode) {
    state.mode = mode === 'signup' ? 'signup' : 'login';
    document.querySelectorAll('[data-auth-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.authMode === state.mode);
    });
    document.querySelectorAll('[data-auth-form]').forEach((form) => {
      const active = form.dataset.authForm === state.mode
        && !(state.mode === 'signup' && state.signupReceived);
      form.classList.toggle('active', active);
    });
    const received = document.getElementById('auth-signup-received');
    if (received) received.hidden = !(state.mode === 'signup' && state.signupReceived);
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

    if (password !== confirmPassword) {
      setStatus('Passwords do not match', 'error');
      return;
    }

    const submitted = await submitAuth('/api/auth/signup', {
      first_name: form.elements.first_name.value,
      last_name: form.elements.last_name.value,
      email,
      password,
    });
    if (!submitted) return;

    form.reset();
    state.signupReceived = true;
    setMode('signup');
  }

  async function submitAuth(endpoint, payload) {
    state.submitting = true;
    setDisabled(true);
    setStatus(endpoint.includes('signup') ? 'Submitting request...' : 'Logging in...', 'info');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
      if (endpoint.includes('signup')) return true;
      window.location.assign(nextUrl());
      return true;
    } catch (err) {
      setStatus(err.message || 'Authentication failed', 'error');
      return false;
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
