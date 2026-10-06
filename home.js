/* ==========================================================================
   Amber — Home page hero: featured dish showcase
   - Thumbnails switch the big photo and the floating dish card
   - Rotates every 5 seconds, with a progress bar on the active thumbnail
   - Pauses on hover / keyboard focus, and has a pause button
   - Subtle 3D tilt on the photo when using a mouse
   The card's "+" button uses the shared cart in site.js (.add-to-cart + data-*).
   ========================================================================== */
(function () {
    'use strict';

    var showcase = document.querySelector('[data-showcase]');
    if (!showcase) return;

    var stage = showcase.querySelector('.showcase-stage');
    var mainImg = showcase.querySelector('.showcase-img');
    var card = showcase.querySelector('.showcase-card');
    var cardThumb = card.querySelector('.showcase-card-thumb');
    var cardName = card.querySelector('.showcase-name');
    var cardPrice = card.querySelector('.showcase-price');
    var addBtn = card.querySelector('.showcase-add');
    var pauseBtn = showcase.querySelector('.showcase-pause');
    var thumbs = Array.prototype.slice.call(showcase.querySelectorAll('.showcase-thumb'));

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var current = 0;
    var swapTimer = null;
    var DURATION = 5000; // ms each dish stays on screen
    var elapsed = 0;     // ms the current dish has been shown (while not paused)

    function formatPrice(value) {
        return 'PHP ' + Number(value).toLocaleString('en-US');
    }

    function show(index) {
        current = (index + thumbs.length) % thumbs.length;
        var dish = thumbs[current].dataset;

        elapsed = 0;
        thumbs.forEach(function (thumb, i) {
            thumb.setAttribute('aria-pressed', String(i === current));
            thumb.querySelector('.thumb-progress').style.transform = '';
        });

        // Card details (also what the "+" button adds to the cart)
        card.dataset.id = dish.id;
        card.dataset.name = dish.name;
        card.dataset.price = dish.price;
        cardThumb.src = dish.img;
        cardName.textContent = dish.name;
        cardPrice.textContent = formatPrice(dish.price);
        addBtn.setAttribute('aria-label', 'Add ' + dish.name + ' to cart');

        // Cross-fade the big photo
        clearTimeout(swapTimer);
        if (reduceMotion) {
            mainImg.src = dish.img;
            mainImg.alt = dish.alt;
            return;
        }
        mainImg.classList.add('is-swapping');
        swapTimer = setTimeout(function () {
            mainImg.src = dish.img;
            mainImg.alt = dish.alt;
            mainImg.classList.remove('is-swapping');
        }, 220);
    }

    thumbs.forEach(function (thumb, i) {
        thumb.addEventListener('click', function () {
            show(i);
        });
    });

    // Little "pop" on the + button when a dish is added
    addBtn.addEventListener('click', function () {
        addBtn.classList.remove('is-added');
        void addBtn.offsetWidth; // restart the animation
        addBtn.classList.add('is-added');
    });

    /* ---------- Autoplay ---------- */

    if (!reduceMotion) {
        var userPaused = false;
        var hovering = false;
        var focused = false;

        function updatePaused() {
            showcase.classList.toggle('is-paused', userPaused || hovering || focused || document.hidden);
        }

        showcase.classList.add('is-autoplay');
        pauseBtn.hidden = false;

        // Clock (10 ticks a second): fills the progress bar, then moves to the next dish.
        var last = performance.now();
        setInterval(function () {
            var now = performance.now();
            if (!showcase.classList.contains('is-paused')) {
                elapsed += Math.min(now - last, 200); // cap the jump after returning to a background tab
                if (elapsed >= DURATION) show(current + 1);
            }
            last = now;
            var bar = thumbs[current].querySelector('.thumb-progress');
            bar.style.transform = 'scaleX(' + Math.min(elapsed / DURATION, 1).toFixed(3) + ')';
        }, 100);

        showcase.addEventListener('mouseenter', function () { hovering = true; updatePaused(); });
        showcase.addEventListener('mouseleave', function () { hovering = false; updatePaused(); });
        showcase.addEventListener('focusin', function () { focused = true; updatePaused(); });
        showcase.addEventListener('focusout', function (event) {
            if (!showcase.contains(event.relatedTarget)) { focused = false; updatePaused(); }
        });
        document.addEventListener('visibilitychange', updatePaused);

        pauseBtn.addEventListener('click', function () {
            userPaused = !userPaused;
            pauseBtn.setAttribute('aria-pressed', String(userPaused));
            pauseBtn.setAttribute('aria-label', userPaused ? 'Play slideshow' : 'Pause slideshow');
            updatePaused();
        });
    }

    /* ---------- 3D tilt (mouse only) ---------- */

    if (!reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        stage.addEventListener('mousemove', function (event) {
            var rect = stage.getBoundingClientRect();
            var x = (event.clientX - rect.left) / rect.width - 0.5;
            var y = (event.clientY - rect.top) / rect.height - 0.5;
            stage.style.transform = 'perspective(900px) rotateY(' + (x * 7).toFixed(2) + 'deg) rotateX(' + (-y * 7).toFixed(2) + 'deg)';
        });
        stage.addEventListener('mouseleave', function () {
            stage.style.transform = '';
        });
    }
})();
