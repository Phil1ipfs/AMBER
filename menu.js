/* ==========================================================================
   Amber — menu page: show one category at a time.
   Without JavaScript every category stays visible, so the menu still works.
   ========================================================================== */
(function () {
    'use strict';

    var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-category]'));
    var sections = Array.prototype.slice.call(document.querySelectorAll('.menu-section'));

    if (!buttons.length || !sections.length) return;

    function hasSection(id) {
        return sections.some(function (section) { return section.id === id; });
    }

    function showCategory(id, updateUrl) {
        sections.forEach(function (section) {
            section.hidden = section.id !== id;
        });
        buttons.forEach(function (button) {
            var active = button.dataset.category === id;
            button.setAttribute('aria-pressed', String(active));
            if (active && button.scrollIntoView && updateUrl) {
                // Keep the selected button visible in the scrollable bar on phones.
                button.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
            }
        });
        if (updateUrl && window.history.replaceState) {
            // Lets people share or bookmark a category, e.g. menu.html#pork
            window.history.replaceState(null, '', '#' + id);
        }
    }

    buttons.forEach(function (button) {
        button.addEventListener('click', function () {
            showCategory(button.dataset.category, true);
        });
    });

    window.addEventListener('hashchange', function () {
        var id = window.location.hash.slice(1);
        if (hasSection(id)) showCategory(id, false);
    });

    var initial = window.location.hash.slice(1);
    showCategory(hasSection(initial) ? initial : sections[0].id, false);
})();
