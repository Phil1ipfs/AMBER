/* ==========================================================================
   Amber — Log In / Sign Up / Reset password pages
   1. Auth provider (Supabase)
   2. Form validation, loading / error / success states
   3. Password visibility toggles
   4. Page transition between Log in and Sign up
   ========================================================================== */
(function () {
    'use strict';

    /* ---------- 1. Auth provider: Supabase Auth ----------
       Settings live in supabase-config.js. Each function returns a Promise:
       resolve on success, or reject with an Error whose message is shown to the visitor. */

    var NOT_CONNECTED = 'Online accounts aren’t available yet. You can still browse the menu and send us an order inquiry.';
    var PHONE_NOT_SUPPORTED = 'Phone number sign-in isn’t available yet. Please use your email address.';
    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // The Supabase connection is shared with the rest of the site (see account.js).
    var account = window.AmberAccount || null;
    var client = account ? account.client : null;
    var setRemember = account ? account.setRemember : function () {};

    // Turn Supabase error codes into messages a visitor can act on.
    var FRIENDLY_ERRORS = {
        invalid_credentials: 'Incorrect email or password.',
        email_not_confirmed: 'Please confirm your email first. Check your inbox for the link we sent you.',
        user_already_exists: 'An account with this email already exists. Try logging in instead.',
        email_exists: 'An account with this email already exists. Try logging in instead.',
        weak_password: 'Please choose a stronger password (at least 8 characters, mixing letters and numbers).',
        email_address_invalid: 'That email address doesn’t look right.',
        over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
        over_email_send_rate_limit: 'Too many emails sent. Please wait a few minutes and try again.',
        signup_disabled: 'New sign-ups are switched off right now.',
        same_password: 'Your new password must be different from your old one.',
        session_not_found: 'Your session has expired. Please request a new link.',
        otp_expired: 'This link has expired. Please request a new one.',
        email_provider_disabled: 'Email sign-in isn’t switched on yet. (Site owner: enable Email in Supabase › Authentication › Sign In / Providers.)',
        provider_disabled: 'Google sign-in isn’t switched on yet. (Site owner: enable Google in Supabase › Authentication › Sign In / Providers.)'
    };

    function friendly(error) {
        var code = (error && error.code) || '';
        var message = (error && error.message) || '';
        if (window.console) console.warn('Supabase auth error:', code || message);
        if (FRIENDLY_ERRORS[code]) return new Error(FRIENDLY_ERRORS[code]);
        if (/provider is not enabled/i.test(message)) return new Error(FRIENDLY_ERRORS.provider_disabled);
        if (/invalid api key|no api key/i.test(message)) {
            return new Error('Accounts aren’t set up correctly yet. (Site owner: check the values in supabase-config.js.)');
        }
        if ((error && error.name === 'AuthRetryableFetchError') || /failed to fetch|network/i.test(message)) {
            return new Error('Can’t reach the server. Check your internet connection and try again.');
        }
        return new Error('Something went wrong. Please try again.');
    }

    // Supabase replies with { data, error } instead of failing, so unwrap it here.
    function unwrap(result) {
        if (result.error) throw friendly(result.error);
        return result.data;
    }

    function rethrow(error) {
        throw friendly(error);
    }

    function requireClient() {
        return client ? null : Promise.reject(new Error(NOT_CONNECTED));
    }

    function requireEmail(identifier) {
        return EMAIL.test(identifier) ? null : Promise.reject(new Error(PHONE_NOT_SUPPORTED));
    }

    // Full web address of a page on this site (email links and Google return here).
    function pageUrl(page) {
        return new URL(page, window.location.href).href;
    }

    var userInfo = account ? account.userInfo : function () { return null; };

    var AuthProvider = {
        signIn: function (identifier, password, remember) {
            var stop = requireClient() || requireEmail(identifier);
            if (stop) return stop;
            setRemember(remember);
            return client.auth.signInWithPassword({ email: identifier, password: password }).then(unwrap, rethrow);
        },
        // Resolves with { needsConfirmation: true } when Supabase sends a confirmation email first.
        signUp: function (fullName, identifier, password) {
            var stop = requireClient() || requireEmail(identifier);
            if (stop) return stop;
            setRemember(true);
            return client.auth.signUp({
                email: identifier,
                password: password,
                options: { data: { full_name: fullName }, emailRedirectTo: pageUrl('index.html') }
            }).then(unwrap, rethrow).then(function (data) {
                // With email confirmation on, an existing email comes back as a user with no identities.
                if (data.user && data.user.identities && data.user.identities.length === 0) {
                    throw new Error(FRIENDLY_ERRORS.user_already_exists);
                }
                return { needsConfirmation: !data.session };
            });
        },
        // Sends the visitor to Google; they come back to the site already signed in.
        signInWithGoogle: function () {
            var stop = requireClient();
            if (stop) return stop;
            // Check Google is switched on first, so visitors never land on a raw Supabase error page.
            return account.providerEnabled('google').then(function (enabled) {
                if (!enabled) throw new Error(FRIENDLY_ERRORS.provider_disabled);
                setRemember(true);
                return client.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: pageUrl(nextPage()), skipBrowserRedirect: true }
                }).then(unwrap, rethrow);
            }).then(function (data) {
                window.location.assign(data.url);
                return { redirecting: true };
            });
        },
        // Emails a link to reset-password.html, where the visitor chooses a new password.
        resetPassword: function (identifier) {
            var stop = requireClient() || requireEmail(identifier);
            if (stop) return stop;
            return client.auth.resetPasswordForEmail(identifier, { redirectTo: pageUrl('reset-password.html') })
                .then(unwrap, rethrow);
        },
        updatePassword: function (password) {
            var stop = requireClient();
            if (stop) return stop;
            return client.auth.updateUser({ password: password }).then(unwrap, rethrow);
        },
        signOut: function () {
            return client ? client.auth.signOut() : Promise.resolve();
        },
        // cb(event, user) whenever the login state changes (also once on page load).
        onChange: function (cb) {
            if (!client) return false;
            client.auth.onAuthStateChange(function (event, session) {
                cb(event, session ? userInfo(session.user) : null);
            });
            return true;
        }
    };

    // Where to go after a successful log in / sign up. Only same-site pages are allowed.
    function nextPage() {
        var next = new URLSearchParams(window.location.search).get('next') || '';
        return /^[A-Za-z0-9_-]+\.html(#[\w-]*)?$/.test(next) ? next : 'index.html';
    }

    /* ---------- 2. Forms ---------- */

    var form = document.querySelector('[data-auth-form]');
    if (!form) return;

    var mode = form.dataset.authForm; // "login", "signup" or "reset"
    var alertBox = form.querySelector('.auth-alert');
    var submitBtn = form.querySelector('.auth-submit');
    var googleBtn = form.querySelector('[data-google-auth]');
    var forgotBtn = form.querySelector('[data-forgot-password]');
    var triedSubmit = false;

    function isPhone(value) {
        var digits = value.replace(/\D/g, '');
        return /^\+?[\d\s()-]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
    }

    function field(name) {
        return form.elements[name];
    }

    // Returns an error message for one field, or '' if it's valid.
    function validateField(name) {
        var input = field(name);
        if (!input) return '';
        var value = input.value.trim();

        switch (name) {
            case 'fullname':
                if (!value) return 'Please enter your full name.';
                if (value.length < 2) return 'Please enter your full name.';
                return '';
            case 'identifier':
                if (!value) return 'Please enter your email or phone number.';
                if (!EMAIL.test(value) && !isPhone(value)) return 'Enter a valid email address or phone number.';
                return '';
            case 'password':
                if (!input.value) return mode === 'login' ? 'Please enter your password.' : 'Please create a password.';
                if (mode !== 'login' && input.value.length < 8) return 'Your password needs at least 8 characters.';
                return '';
            case 'confirm':
                if (!input.value) return 'Please confirm your password.';
                if (input.value !== field('password').value) return 'Passwords don’t match.';
                return '';
        }
        return '';
    }

    function showFieldError(name, message) {
        var input = field(name);
        var error = document.getElementById(name + '-error');
        if (!input || !error) return;
        error.textContent = message;
        if (message) {
            input.setAttribute('aria-invalid', 'true');
        } else {
            input.removeAttribute('aria-invalid');
        }
    }

    function fieldNames() {
        if (mode === 'signup') return ['fullname', 'identifier', 'password', 'confirm'];
        if (mode === 'reset') return ['password', 'confirm'];
        return ['identifier', 'password'];
    }

    // Validate every field; focus the first invalid one. Returns true if all valid.
    function validateAll() {
        var firstInvalid = null;
        fieldNames().forEach(function (name) {
            var message = validateField(name);
            showFieldError(name, message);
            if (message && !firstInvalid) firstInvalid = field(name);
        });
        if (firstInvalid) firstInvalid.focus();
        return !firstInvalid;
    }

    function showAlert(message, type) {
        alertBox.textContent = message;
        alertBox.dataset.type = type;
        alertBox.hidden = false;
    }

    function hideAlert() {
        alertBox.hidden = true;
        alertBox.textContent = '';
    }

    function setLoading(button, loading, label) {
        var text = button.querySelector('.btn-label');
        if (loading) {
            button.dataset.label = text.textContent;
            text.textContent = label;
        } else if (button.dataset.label) {
            text.textContent = button.dataset.label;
        }
        button.classList.toggle('is-loading', loading);
        button.setAttribute('aria-busy', String(loading));
        // Lock both buttons while a request is running so it can't be sent twice.
        [submitBtn, googleBtn].forEach(function (b) { if (b) b.disabled = loading; });
    }

    var redirecting = false;

    function succeed(message) {
        redirecting = true;
        hideSessionNote();
        showAlert(message, 'success');
        setTimeout(function () { window.location.href = nextPage(); }, 900);
    }

    // When someone opens Log in / Sign up while already signed in, the form is
    // replaced by a "You're signed in" card (and comes back after logging out).
    var sessionNote = null;
    var headScript = document.querySelector('.auth-script');
    var headTitle = document.getElementById('auth-title');
    var headSub = document.querySelector('.auth-sub');
    var originalHead = {
        script: headScript ? headScript.textContent : '',
        title: headTitle ? headTitle.textContent : '',
        sub: headSub ? headSub.textContent : ''
    };

    function setHead(script, title, sub) {
        if (headScript) headScript.textContent = script;
        if (headTitle) headTitle.textContent = title;
        if (headSub) headSub.textContent = sub;
    }

    function hideSessionNote() {
        if (!sessionNote) return;
        sessionNote.remove();
        sessionNote = null;
        document.body.classList.remove('is-signed-in');
        setHead(originalHead.script, originalHead.title, originalHead.sub);
    }

    function showSessionNote(user) {
        hideSessionNote();
        document.body.classList.add('is-signed-in');
        setHead('Hello again!', 'You\u2019re already signed in', 'Pick up right where you left off.');

        sessionNote = document.createElement('div');
        sessionNote.className = 'auth-session';

        var who = document.createElement('div');
        who.className = 'auth-session-who';
        var avatar = document.createElement('span');
        avatar.className = 'avatar avatar-xl';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = account ? account.initials(user) : '';
        var details = document.createElement('div');
        var name = document.createElement('p');
        name.className = 'auth-session-name';
        name.textContent = user.name || 'Your account';
        var email = document.createElement('p');
        email.className = 'auth-session-email';
        email.textContent = user.email;
        details.append(name, email);
        who.append(avatar, details);

        var go = document.createElement('a');
        go.className = 'btn btn-cta btn-block';
        go.href = nextPage();
        go.innerHTML = '<span>Continue to Amber</span><svg class="btn-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

        var other = document.createElement('p');
        other.className = 'auth-session-other';
        other.append('Not you? ');
        var out = document.createElement('button');
        out.type = 'button';
        out.className = 'auth-link';
        out.textContent = 'Log out';
        out.addEventListener('click', function () {
            AuthProvider.signOut().then(function () {
                showAlert('You\u2019ve been logged out.', 'success');
            });
        });
        other.append(out);

        sessionNote.append(who, go, other);
        form.parentNode.insertBefore(sessionNote, form);
    }

    // Reset page: the emailed link signs the visitor in temporarily so they can set a new password.
    var recoveryReady = false;

    var watching = AuthProvider.onChange(function (event, user) {
        if (redirecting) return;
        if (mode === 'reset') {
            if (user && !recoveryReady) {
                recoveryReady = true;
                hideAlert();
            }
            return;
        }
        if (user) {
            showSessionNote(user);
        } else {
            hideSessionNote();
        }
    });

    if (mode === 'reset') {
        if (!watching) {
            showAlert(NOT_CONNECTED, 'error');
        } else {
            // Give the link a moment to be read; if no session appears, it's invalid or expired.
            setTimeout(function () {
                if (!recoveryReady && !redirecting) {
                    showAlert('This reset link is invalid or has expired. Go back to Log in and use “Forgot password?” to get a new one.', 'error');
                }
            }, 2500);
        }
    }

    function fail(button, error) {
        setLoading(button, false);
        showAlert(error && error.message ? error.message : 'Something went wrong. Please try again.', 'error');
    }

    // Re-check a field as the visitor fixes it (only after the first submit attempt).
    fieldNames().forEach(function (name) {
        var input = field(name);
        input.addEventListener('input', function () {
            if (!triedSubmit) return;
            showFieldError(name, validateField(name));
            if (name === 'password' && field('confirm') && field('confirm').value) {
                showFieldError('confirm', validateField('confirm'));
            }
        });
        input.addEventListener('blur', function () {
            if (triedSubmit) showFieldError(name, validateField(name));
        });
    });

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        triedSubmit = true;
        hideAlert();
        if (!validateAll()) return;

        var password = field('password').value;

        if (mode === 'reset') {
            if (!recoveryReady) {
                showAlert('This reset link is invalid or has expired. Go back to Log in and use “Forgot password?” to get a new one.', 'error');
                return;
            }
            setLoading(submitBtn, true, 'Saving…');
            AuthProvider.updatePassword(password)
                .then(function () { succeed('Your password has been updated. Taking you to Amber…'); })
                .catch(function (error) { fail(submitBtn, error); });
            return;
        }

        var identifier = field('identifier').value.trim();

        if (mode === 'signup') {
            setLoading(submitBtn, true, 'Creating account…');
            AuthProvider.signUp(field('fullname').value.trim(), identifier, password)
                .then(function (result) {
                    if (result && result.needsConfirmation) {
                        // Supabase emails a confirmation link before the account can be used.
                        setLoading(submitBtn, false);
                        showAlert('Almost there! We’ve sent a confirmation link to ' + identifier + '. Click it to activate your account, then log in.', 'success');
                        return;
                    }
                    succeed('Your account is ready. Welcome to Amber!');
                })
                .catch(function (error) { fail(submitBtn, error); });
        } else {
            var remember = form.elements.remember ? form.elements.remember.checked : false;
            setLoading(submitBtn, true, 'Logging in…');
            AuthProvider.signIn(identifier, password, remember)
                .then(function () { succeed('Welcome back! Taking you to Amber…'); })
                .catch(function (error) { fail(submitBtn, error); });
        }
    });

    if (googleBtn) {
        googleBtn.addEventListener('click', function () {
            hideAlert();
            setLoading(googleBtn, true, 'Connecting to Google…');
            AuthProvider.signInWithGoogle()
                .then(function (result) {
                    // The browser is now going to Google, which sends the visitor back signed in.
                    if (result && result.redirecting) return;
                    succeed('Signed in with Google. Taking you to Amber…');
                })
                .catch(function (error) { fail(googleBtn, error); });
        });
    }

    if (forgotBtn) {
        forgotBtn.addEventListener('click', function () {
            hideAlert();
            var message = validateField('identifier');
            showFieldError('identifier', message);
            if (message) {
                field('identifier').focus();
                return;
            }
            forgotBtn.disabled = true;
            AuthProvider.resetPassword(field('identifier').value.trim())
                .then(function () {
                    showAlert('If an account exists for that email or phone number, we’ve sent password reset instructions.', 'success');
                })
                .catch(function (error) {
                    showAlert(error && error.message ? error.message : 'Something went wrong. Please try again.', 'error');
                })
                .finally(function () { forgotBtn.disabled = false; });
        });
    }

    /* ---------- 3. Password visibility ---------- */

    document.querySelectorAll('[data-toggle-password]').forEach(function (button) {
        var input = document.getElementById(button.dataset.togglePassword);
        button.addEventListener('click', function () {
            var show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            input.toggleAttribute('data-revealed', show);
            button.setAttribute('aria-pressed', String(show));
            button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        });
    });

    /* ---------- 4. Page transition ---------- */

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('[data-auth-nav]').forEach(function (link) {
        link.addEventListener('click', function (event) {
            if (reduceMotion || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            document.body.classList.add('is-leaving');
            setTimeout(function () { window.location.href = link.href; }, 180);
        });
    });

    // Coming back with the browser's Back button shouldn't leave the page faded out.
    window.addEventListener('pageshow', function () {
        document.body.classList.remove('is-leaving');
    });
})();
