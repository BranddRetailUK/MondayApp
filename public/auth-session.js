(function () {
  const logoutButton = document.getElementById('logoutButton');
  logoutButton?.addEventListener('click', logout);

  window.ultimateHubUser = null;
  window.ultimateHubUserPromise = fetch('/api/auth/me', {
    cache: 'no-store',
    credentials: 'include',
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
        return null;
      }
      window.ultimateHubUser = data.user;
      applyAccessScope(data.user);
      updateSidebarUser(data.user);
      if (data.user.access_scope === 'dtf_only') {
        window.activateDashboardTab?.('dtf-uploader');
      }
      document.body.classList.remove('hub-auth-pending');
      document.dispatchEvent(new CustomEvent('ultimatehub:user', { detail: data.user }));
      return data.user;
    })
    .catch(() => {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
      return null;
    });

  function applyAccessScope(user) {
    const dtfOnly = user?.access_scope === 'dtf_only';
    document.body.classList.toggle('hub-access-dtf-only', dtfOnly);
    document.querySelectorAll('.nav-tabs li[data-tab]').forEach((tab) => {
      tab.hidden = dtfOnly && tab.dataset.tab !== 'dtf-uploader';
    });
  }

  function updateSidebarUser(user) {
    const sub = document.querySelector('.sidebar-sub');
    const fullName = [user?.first_name, user?.last_name]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ');
    if (sub) sub.textContent = fullName || user?.email || 'User';
  }

  async function logout() {
    if (!logoutButton || logoutButton.disabled) return;

    logoutButton.disabled = true;
    logoutButton.textContent = 'Logging out...';

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`Logout failed: ${response.status}`);
      window.location.replace('/login');
    } catch (err) {
      console.error('POST /api/auth/logout', err);
      logoutButton.disabled = false;
      logoutButton.textContent = 'Log out';
      window.alert('Could not log out. Please try again.');
    }
  }
})();
