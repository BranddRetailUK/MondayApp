(function () {
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
      updateSidebarUser(data.user);
      document.dispatchEvent(new CustomEvent('ultimatehub:user', { detail: data.user }));
      return data.user;
    })
    .catch(() => {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
      return null;
    });

  function updateSidebarUser(user) {
    const sub = document.querySelector('.sidebar-sub');
    const fullName = [user?.first_name, user?.last_name]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ');
    if (sub) sub.textContent = fullName || user?.email || 'User';
  }
})();
