/* ==========================================================================
   Amber — shared script (all pages)
   1. Mobile navigation toggle
   2. Shopping cart (saved in the browser with localStorage)
   3. Contact form submission (Formspree)
   4. Location map controls (Map / Satellite, zoom, re-center)
   ========================================================================== */
(function () {
    'use strict';

    /* ---------- 1. Mobile navigation ---------- */

    var header = document.querySelector('.site-header');
    var navToggle = document.querySelector('.nav-toggle');

    if (header && navToggle) {
        navToggle.addEventListener('click', function () {
            var open = header.classList.toggle('nav-open');
            navToggle.setAttribute('aria-expanded', String(open));
        });
    }

    // Frosted header once the page is scrolled
    if (header) {
        var updateScrolled = function () {
            header.classList.toggle('is-scrolled', window.scrollY > 8);
        };
        window.addEventListener('scroll', updateScrolled, { passive: true });
        updateScrolled();
    }

    // Desktop nav: a red pill slides to the hovered/focused link, then back to the current page
    var navList = document.querySelector('.site-nav ul');

    if (navList) {
        var navLinks = Array.prototype.slice.call(navList.querySelectorAll('a'));
        var currentLink = navList.querySelector('a[aria-current="page"]');
        var indicator = document.createElement('span');
        indicator.className = 'nav-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        navList.insertBefore(indicator, navList.firstChild);
        navList.classList.add('has-indicator');

        var moveIndicator = function (link, instant) {
            navLinks.forEach(function (l) { l.classList.toggle('is-lit', l === link); });
            if (!link) {
                indicator.style.opacity = '0';
                return;
            }
            if (instant) indicator.classList.add('no-anim');
            indicator.style.width = link.offsetWidth + 'px';
            indicator.style.transform = 'translateX(' + link.offsetLeft + 'px)';
            indicator.style.opacity = '1';
            if (instant) {
                void indicator.offsetWidth; // apply the position before turning animation back on
                indicator.classList.remove('no-anim');
            }
        };

        navLinks.forEach(function (link) {
            link.addEventListener('mouseenter', function () { moveIndicator(link); });
            link.addEventListener('focus', function () { moveIndicator(link); });
        });
        navList.addEventListener('mouseleave', function () { moveIndicator(currentLink); });
        navList.addEventListener('focusout', function (event) {
            if (!navList.contains(event.relatedTarget)) moveIndicator(currentLink);
        });

        // Place it on the current page without animating, and again once fonts/sizes settle
        moveIndicator(currentLink, true);
        window.addEventListener('resize', function () { moveIndicator(currentLink, true); });
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () { moveIndicator(currentLink, true); });
        }
    }

    /* ---------- 2. Cart ---------- */

    var CART_KEY = 'amber-cart';
    // Same "PHP 1,500" format the menu cards use
    var peso = {
        format: function (amount) { return 'PHP ' + amount.toLocaleString('en-US'); }
    };

    function isValidItem(item) {
        return item && typeof item.id === 'string' && typeof item.name === 'string' &&
            isFinite(item.price) && item.price >= 0 && Number.isInteger(item.qty) && item.qty > 0 &&
            // Only allow this site's own images, never an outside URL
            (!item.img || (typeof item.img === 'string' && item.img.indexOf('asset/image/') === 0));
    }

    function loadCart() {
        try {
            var data = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
            return Array.isArray(data) ? data.filter(isValidItem) : [];
        } catch (e) {
            return []; // corrupt data or storage blocked: start with an empty cart
        }
    }

    var cart = loadCart();

    function saveCart() {
        try {
            localStorage.setItem(CART_KEY, JSON.stringify(cart));
        } catch (e) {
            // Storage unavailable (e.g. private mode): the cart still works for this page view.
        }
        renderCart();
    }

    // Drawer markup is created here so it doesn't have to be repeated on every page.
    document.body.insertAdjacentHTML('beforeend',
        '<div class="cart-backdrop" data-cart-close></div>' +
        '<aside class="cart-drawer" id="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">' +
            '<div class="cart-head">' +
                '<h2 id="cart-title">Your cart</h2>' +
                '<button class="icon-btn" type="button" data-cart-close aria-label="Close cart">&times;</button>' +
            '</div>' +
            '<div class="cart-body">' +
                '<p class="cart-empty">Your cart is empty.<br><a href="menu.html">Browse the menu</a></p>' +
                '<ul class="cart-items"></ul>' +
            '</div>' +
            '<div class="cart-foot">' +
                '<div class="cart-total"><span>Total</span><span data-cart-total></span></div>' +
                '<a class="btn btn-primary btn-block" href="Contact.html?subject=Order%20inquiry">Send order inquiry</a>' +
                '<button class="link-btn" type="button" data-cart-clear>Clear cart</button>' +
                '<p class="cart-note">Online payment isn’t available yet. Send us your order and we’ll confirm by phone or email.</p>' +
            '</div>' +
        '</aside>' +
        '<div class="toast" role="status" aria-live="polite"></div>'
    );

    var drawer = document.getElementById('cart-drawer');
    var list = drawer.querySelector('.cart-items');
    var emptyMsg = drawer.querySelector('.cart-empty');
    var foot = drawer.querySelector('.cart-foot');
    var totalEl = drawer.querySelector('[data-cart-total]');
    var toast = document.querySelector('.toast');
    var lastFocus = null;
    var toastTimer = null;

    function renderCart() {
        var count = 0;
        var total = 0;
        list.replaceChildren();

        cart.forEach(function (item) {
            count += item.qty;
            total += item.price * item.qty;

            var li = document.createElement('li');
            li.className = 'cart-item';

            var img = document.createElement('img');
            img.src = item.img || 'asset/image/amberlogo.png';
            img.alt = '';

            var info = document.createElement('div');
            var name = document.createElement('p');
            name.className = 'cart-item-name';
            name.textContent = item.name;
            var each = document.createElement('p');
            each.className = 'cart-item-price';
            each.textContent = peso.format(item.price) + ' each';

            var qty = document.createElement('div');
            qty.className = 'qty';
            qty.innerHTML =
                '<button type="button" data-qty="-1"></button>' +
                '<span></span>' +
                '<button type="button" data-qty="1"></button>';
            qty.children[0].textContent = '−';
            qty.children[0].setAttribute('aria-label', 'Remove one ' + item.name);
            qty.children[1].textContent = item.qty;
            qty.children[2].textContent = '+';
            qty.children[2].setAttribute('aria-label', 'Add one ' + item.name);
            qty.dataset.id = item.id;

            info.append(name, each, qty);

            var right = document.createElement('div');
            var lineTotal = document.createElement('p');
            lineTotal.className = 'cart-item-total';
            lineTotal.textContent = peso.format(item.price * item.qty);
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'link-btn';
            remove.textContent = 'Remove';
            remove.dataset.remove = item.id;
            remove.setAttribute('aria-label', 'Remove ' + item.name + ' from cart');
            right.append(lineTotal, remove);

            li.append(img, info, right);
            list.append(li);
        });

        emptyMsg.hidden = cart.length > 0;
        foot.hidden = cart.length === 0;
        totalEl.textContent = peso.format(total);

        document.querySelectorAll('[data-cart-count]').forEach(function (badge) {
            badge.textContent = count;
            badge.hidden = count === 0;
        });
        document.querySelectorAll('.cart-button[data-cart-open]').forEach(function (btn) {
            btn.setAttribute('aria-label', 'Open cart, ' + count + (count === 1 ? ' item' : ' items'));
        });
    }

    // While the cart is open, the rest of the page can't be focused or read by screen readers.
    function setPageInert(inert) {
        Array.prototype.forEach.call(document.body.children, function (el) {
            if (el === drawer || el.classList.contains('cart-backdrop') || el.classList.contains('toast') ||
                el.tagName === 'SCRIPT') return;
            el.inert = inert;
        });
    }

    function openCart() {
        lastFocus = document.activeElement;
        document.body.classList.add('cart-is-open');
        setPageInert(true);
        drawer.querySelector('.icon-btn').focus();
    }

    function closeCart() {
        document.body.classList.remove('cart-is-open');
        setPageInert(false);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    // Keep Tab / Shift+Tab cycling inside the open cart.
    drawer.addEventListener('keydown', function (event) {
        if (event.key !== 'Tab') return;
        var focusable = Array.prototype.filter.call(
            drawer.querySelectorAll('a[href], button:not([disabled])'),
            function (el) { return el.offsetParent !== null; }
        );
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toast.classList.remove('is-visible');
        }, 2200);
    }

    function addItem(card) {
        var id = card.dataset.id;
        var existing = cart.find(function (item) { return item.id === id; });
        if (existing) {
            existing.qty += 1;
        } else {
            var img = card.querySelector('img');
            cart.push({
                id: id,
                name: card.dataset.name,
                price: Number(card.dataset.price),
                img: img ? img.getAttribute('src') : '',
                qty: 1
            });
        }
        saveCart();
        showToast(card.dataset.name + ' added to cart');
    }

    function changeQty(id, delta) {
        var item = cart.find(function (i) { return i.id === id; });
        if (!item) return;
        item.qty += delta;
        if (item.qty <= 0) {
            cart = cart.filter(function (i) { return i.id !== id; });
        }
        saveCart();
    }

    // One click listener handles every cart button on the page.
    document.addEventListener('click', function (event) {
        var target = event.target;

        var addBtn = target.closest('.add-to-cart');
        if (addBtn) {
            var card = addBtn.closest('[data-id]');
            if (card) addItem(card);
            return;
        }
        if (target.closest('[data-cart-open]')) {
            openCart();
            return;
        }
        if (target.closest('[data-cart-close]')) {
            closeCart();
            return;
        }
        if (target.closest('[data-cart-clear]')) {
            cart = [];
            saveCart();
            drawer.querySelector('.icon-btn').focus();
            return;
        }
        var qtyBtn = target.closest('[data-qty]');
        if (qtyBtn) {
            changeQty(qtyBtn.parentElement.dataset.id, Number(qtyBtn.dataset.qty));
            return;
        }
        var removeBtn = target.closest('[data-remove]');
        if (removeBtn) {
            cart = cart.filter(function (i) { return i.id !== removeBtn.dataset.remove; });
            saveCart();
            drawer.querySelector('.icon-btn').focus();
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && document.body.classList.contains('cart-is-open')) {
            closeCart();
        }
    });

    // Keep the cart in sync if it changes in another tab.
    window.addEventListener('storage', function (event) {
        if (event.key === CART_KEY) {
            cart = loadCart();
            renderCart();
        }
    });

    renderCart();

    /* ---------- 3. Contact form ---------- */

    var form = document.querySelector('form[data-contact-form]');

    if (form) {
        var status = form.querySelector('.form-status');
        var submitBtn = form.querySelector('[type="submit"]');

        // Pre-fill the subject from links like Contact.html?subject=Catering%20inquiry,
        // and list the cart contents when arriving from the cart's "Send order inquiry" button.
        var params = new URLSearchParams(window.location.search);
        var subjectField = form.querySelector('[name="subject"]');
        var subject = params.get('subject');
        if (subjectField && subject) {
            subjectField.value = subject;
            var messageField = form.querySelector('[name="message"]');
            if (messageField && subject === 'Order inquiry' && cart.length) {
                messageField.value = 'I would like to order:\n' + cart.map(function (i) {
                    return '- ' + i.qty + ' x ' + i.name;
                }).join('\n') + '\n\nTotal: ' + peso.format(cart.reduce(function (sum, i) {
                    return sum + i.price * i.qty;
                }, 0));
            }
        }

        function setStatus(message, state) {
            status.textContent = message;
            status.dataset.state = state;
        }

        form.addEventListener('submit', function (event) {
            event.preventDefault();

            // The Formspree form ID hasn't been filled in yet (see Contact.html).
            if (form.action.indexOf('YOUR_FORM_ID') !== -1) {
                setStatus('Sorry, our contact form isn’t available yet. Please call us at 800-234-567.', 'error');
                return;
            }

            submitBtn.disabled = true;
            setStatus('Sending…', 'pending');

            fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
                headers: { Accept: 'application/json' }
            }).then(function (response) {
                if (!response.ok) throw new Error('Request failed: ' + response.status);
                form.reset();
                setStatus('Thank you! Your message has been sent. We’ll get back to you soon.', 'success');
            }).catch(function () {
                setStatus('Sorry, something went wrong. Please try again or call us at 800-234-567.', 'error');
            }).finally(function () {
                submitBtn.disabled = false;
            });
        });
    }

    /* ---------- 4. Location map ---------- */

    // The Google embed is reloaded with new settings. Amber's marker is drawn at the
    // centre of the map, so zooming and switching views keep it in the right place.
    document.querySelectorAll('[data-map]').forEach(function (map) {
        var frame = map.querySelector('iframe');
        var lat = map.dataset.lat;
        var lng = map.dataset.lng;
        var startZoom = Number(map.dataset.zoom) || 13;
        var zoom = startZoom;
        var type = 'm'; // m = map, k = satellite
        var MIN_ZOOM = 3;
        var MAX_ZOOM = 20;

        var typeButtons = map.querySelectorAll('[data-map-type]');
        var zoomIn = map.querySelector('[data-map-zoom="1"]');
        var zoomOut = map.querySelector('[data-map-zoom="-1"]');

        function update() {
            frame.src = 'https://maps.google.com/maps?ll=' + lat + ',' + lng +
                '&z=' + zoom + '&t=' + type + '&output=embed';
            typeButtons.forEach(function (btn) {
                btn.setAttribute('aria-pressed', String(btn.dataset.mapType === type));
            });
            zoomIn.disabled = zoom >= MAX_ZOOM;
            zoomOut.disabled = zoom <= MIN_ZOOM;
        }

        typeButtons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (type === btn.dataset.mapType) return;
                type = btn.dataset.mapType;
                update();
            });
        });

        [zoomIn, zoomOut].forEach(function (btn) {
            btn.addEventListener('click', function () {
                zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + Number(btn.dataset.mapZoom)));
                update();
            });
        });

        // Dragging the map moves it away from the marker; this puts Amber back in the middle.
        map.querySelector('[data-map-recenter]').addEventListener('click', function () {
            zoom = startZoom;
            update();
        });

        map.querySelectorAll('.map-type, .map-zoom').forEach(function (el) {
            el.hidden = false;
        });
    });
})();
