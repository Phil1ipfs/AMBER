/* ==========================================================================
   Amber — account (shared by every page)
   1. Supabase connection (settings in supabase-config.js)
   2. Header account button: initials + menu when signed in, link to Log in when not
   Exposes window.AmberAccount for auth.js (Log In / Sign Up / Reset password pages).
   ========================================================================== */
(function () {
    'use strict';

    /* ---------- 0. Failed sign-in returns ----------
       If Google or an email link comes back with an error (e.g. ?error=...&error_description=...),
       send the visitor to the login page, which explains it, instead of leaving the error in the address bar. */

    (function () {
        var params = new URLSearchParams(window.location.search + '&' + window.location.hash.replace(/^#/, ''));
        var code = params.get('error_code') || params.get('error');
        if (!code) return;
        var onAuthPage = /(?:login|signup|reset-password)\.html$/.test(window.location.pathname);
        var target = 'login.html?auth_error=' + encodeURIComponent(code);
        if (onAuthPage && window.location.pathname.indexOf('reset-password.html') !== -1) return; // reset page explains its own errors
        window.location.replace(onAuthPage ? window.location.pathname.replace(/[^/]*$/, '') + target : target);
    })();

    /* ---------- 1. Supabase connection ---------- */

    var settings = window.AMBER_SUPABASE || {};

    // "Remember me": keep the login in localStorage (stays signed in) or
    // sessionStorage (signed out when the browser closes).
    var REMEMBER_KEY = 'amber-remember';

    function remembering() {
        try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch (e) { return true; }
    }

    function setRemember(on) {
        try { localStorage.setItem(REMEMBER_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked */ }
    }

    var sessionStore = {
        getItem: function (key) {
            try { return localStorage.getItem(key) || sessionStorage.getItem(key); } catch (e) { return null; }
        },
        setItem: function (key, value) {
            try {
                if (remembering()) {
                    localStorage.setItem(key, value);
                    sessionStorage.removeItem(key);
                } else {
                    sessionStorage.setItem(key, value);
                    localStorage.removeItem(key);
                }
            } catch (e) { /* storage blocked: the login lasts for this page only */ }
        },
        removeItem: function (key) {
            try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
        }
    };

    var client = null;

    if (window.supabase && settings.url && settings.anonKey) {
        try {
            client = window.supabase.createClient(settings.url, settings.anonKey, {
                auth: {
                    storage: sessionStore,
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true, // picks up the login from email links and Google
                    flowType: 'implicit'      // email links work even if opened in another browser
                }
            });
        } catch (e) {
            client = null;
            if (window.console) console.error('Supabase could not start:', e);
        }
    }

    function userInfo(user) {
        if (!user) return null;
        var meta = user.user_metadata || {};
        return { name: meta.full_name || meta.name || '', email: user.email || '' };
    }

    // "Phillip Casingal" -> "PC", "maria@example.com" -> "M"
    function initials(info) {
        var name = (info && info.name || '').trim();
        if (name) {
            var parts = name.split(/\s+/);
            return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
        }
        return ((info && info.email) || '?').charAt(0).toUpperCase();
    }

    // Asks Supabase (public settings endpoint) whether a sign-in method like Google is switched on.
    // If the check itself fails, assume it is on and let Supabase decide.
    function providerEnabled(name) {
        return fetch(settings.url.replace(/\/+$/, '') + '/auth/v1/settings', { headers: { apikey: settings.anonKey } })
            .then(function (response) { return response.json(); })
            .then(function (data) { return !!(data && data.external && data.external[name]); })
            .catch(function () { return true; });
    }

    window.AmberAccount = {
        client: client,
        providerEnabled: providerEnabled,
        setRemember: setRemember,
        userInfo: userInfo,
        initials: initials
    };

    /* ---------- 2. Header account button ---------- */

    var profileLink = document.querySelector('.site-header a.profile');
    if (!profileLink || !client) return;

    var wrap = document.createElement('div');
    wrap.className = 'account';
    wrap.hidden = true;
    wrap.innerHTML =
        '<button class="profile account-button" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="account-menu">' +
            '<span class="avatar" aria-hidden="true"></span>' +
        '</button>' +
        '<div class="account-menu" id="account-menu" hidden>' +
            '<div class="account-head">' +
                '<span class="avatar avatar-lg" aria-hidden="true"></span>' +
                '<div class="account-who"><p class="account-name"></p><p class="account-email"></p></div>' +
            '</div>' +
            '<button class="account-item" type="button" data-cart-open>' +
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 8h13l-1 11.2a1.5 1.5 0 0 1-1.5 1.3H8a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/></svg>' +
                'View my cart' +
            '</button>' +
            '<a class="account-item" href="menu.html">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h10"/></svg>' +
                'Browse menu' +
            '</a>' +
            '<hr>' +
            '<button class="account-item account-logout" type="button">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/></svg>' +
                'Log out' +
            '</button>' +
        '</div>';
    profileLink.parentNode.insertBefore(wrap, profileLink);

    var button = wrap.querySelector('.account-button');
    var menu = wrap.querySelector('.account-menu');

    function openMenu() {
        menu.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        menu.querySelector('.account-item').focus();
    }

    function closeMenu(returnFocus) {
        if (menu.hidden) return;
        menu.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        if (returnFocus) button.focus();
    }

    button.addEventListener('click', function () {
        if (menu.hidden) { openMenu(); } else { closeMenu(false); }
    });

    // Close when clicking elsewhere, pressing Escape, or choosing an item.
    document.addEventListener('click', function (event) {
        if (!wrap.contains(event.target)) closeMenu(false);
    });
    wrap.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeMenu(true);
    });
    menu.addEventListener('click', function (event) {
        if (event.target.closest('.account-item')) closeMenu(false);
    });

    menu.querySelector('.account-logout').addEventListener('click', function () {
        client.auth.signOut();
    });

    function render(info) {
        if (info) {
            var label = info.name || info.email;
            wrap.querySelectorAll('.avatar').forEach(function (el) { el.textContent = initials(info); });
            wrap.querySelector('.account-name').textContent = info.name || 'Your account';
            wrap.querySelector('.account-email').textContent = info.email;
            wrap.querySelector('.account-email').title = info.email; // full address on hover if it gets trimmed
            button.setAttribute('aria-label', 'Account menu for ' + label);
            wrap.hidden = false;
            profileLink.hidden = true;
        } else {
            closeMenu(false);
            wrap.hidden = true;
            profileLink.hidden = false;
        }
    }

    client.auth.onAuthStateChange(function (event, session) {
        render(session ? userInfo(session.user) : null);
    });
})();
