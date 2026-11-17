/**
 * AVENIR AI - Universal Theme Manager
 * Manages Light Mode and Dark Mode with persistent localStorage,
 * system preference detection, zero-flash loading, and animated toggle icon synchronization.
 */

(function () {
  const THEME_STORAGE_KEY = 'avenir_theme';

  /**
   * Determine initial theme before DOM loads to prevent Flash of Unstyled Content (FOUC)
   */
  function getPreferredTheme() {
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme === 'dark' || storedTheme === 'light') {
        return storedTheme;
      }
    } catch (_) {}

    // Respect OS preference if no stored choice
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  // Apply immediately to html element
  const currentTheme = getPreferredTheme();
  document.documentElement.setAttribute('data-theme', currentTheme);
  if (document.body) {
    document.body.setAttribute('data-theme', currentTheme);
  }

  /**
   * Apply theme and synchronize all toggle buttons across the DOM
   */
  function applyTheme(theme) {
    const validTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', validTheme);
    if (document.body) {
      document.body.setAttribute('data-theme', validTheme);
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, validTheme);
    } catch (_) {}

    // Update all toggle buttons in the document
    const toggleBtns = document.querySelectorAll('.theme-toggle-btn, [data-theme-toggle]');
    toggleBtns.forEach((btn) => {
      btn.setAttribute('aria-pressed', validTheme === 'dark' ? 'true' : 'false');
      btn.setAttribute('title', validTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode');
      
      const sunIcon = btn.querySelector('.theme-icon-sun, [data-lucide="sun"]');
      const moonIcon = btn.querySelector('.theme-icon-moon, [data-lucide="moon"]');

      if (sunIcon && moonIcon) {
        if (validTheme === 'dark') {
          sunIcon.style.display = 'none';
          moonIcon.style.display = 'inline-flex';
        } else {
          sunIcon.style.display = 'inline-flex';
          moonIcon.style.display = 'none';
        }
      }
    });

    // Notify any listening components (e.g., Chart.js instances)
    window.dispatchEvent(new CustomEvent('avenir-theme-changed', { detail: { theme: validTheme } }));
  }

  /**
   * Toggle between light and dark themes
   */
  function toggleTheme() {
    const active = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = active === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  }

  // Export functions to window
  window.AvenirTheme = {
    get: () => document.documentElement.getAttribute('data-theme') || 'light',
    set: applyTheme,
    toggle: toggleTheme,
  };

  // Set up listeners when DOM is loaded
  document.addEventListener('DOMContentLoaded', () => {
    // Re-ensure attribute is present on body
    const active = document.documentElement.getAttribute('data-theme') || 'light';
    if (document.body) {
      document.body.setAttribute('data-theme', active);
    }

    // Attach click listeners to all theme toggle buttons
    document.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.theme-toggle-btn, [data-theme-toggle]');
      if (toggleBtn) {
        e.preventDefault();
        toggleTheme();
      }
    });

    // Synchronize buttons initial state
    applyTheme(active);

    // Listen for OS theme changes if user hasn't set an explicit preference
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        try {
          if (!localStorage.getItem(THEME_STORAGE_KEY)) {
            applyTheme(e.matches ? 'dark' : 'light');
          }
        } catch (_) {}
      });
    }
  });
})();

