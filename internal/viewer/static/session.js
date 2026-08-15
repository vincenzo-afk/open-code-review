// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 alibaba/open-code-review Contributors

document.querySelectorAll('.response-text').forEach(function(el) {
    const text = el.textContent;
    const esc = function(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
    const codeBlocks = [];
    let html = esc(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
        codeBlocks.push(code.replace(/^\n|\n$/g, ''));
        return '%%CODEBLOCK_' + (codeBlocks.length - 1) + '%%';
    });
    html = html
        .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^### (.+)$/gm, '<div class="md-h3">$1</div>')
        .replace(/^## (.+)$/gm, '<div class="md-h2">$1</div>')
        .replace(/^# (.+)$/gm, '<div class="md-h1">$1</div>')
        .replace(/^[-*] (.+)$/gm, '<div class="md-li">&bull; $1</div>')
        .replace(/\n{2,}/g, '<br><br>')
        .replace(/\n/g, '<br>');
    codeBlocks.forEach(function(code, i) {
        html = html.replace('%%CODEBLOCK_' + i + '%%',
            '<pre class="code-block"><code>' + code + '</code></pre>');
    });
    el.innerHTML = html;
});

(function() {
    const filters = Array.from(document.querySelectorAll('.comment-filter-chip[data-filter-kind]'));
    const groups = Array.from(document.querySelectorAll('.comment-file-group'));
    const emptyState = document.querySelector('[data-comment-filter-empty]');
    const statusNote = document.querySelector('[data-comment-status-note]');
    const showMarkedToggle = document.querySelector('[data-show-marked]');

    if (filters.length === 0 || groups.length === 0) {
        return;
    }

    let activeSeverity = 'all';
    let activeCategory = 'all';
    let activeStatus = 'all';

    // Per-comment status persisted in localStorage, scoped to this session page
    // so reviewers can mark findings fixed/solved/ignored across reloads.
    const STORAGE_KEY = 'ocr-viewer:comment-status:' + window.location.pathname;

    function loadStatusMap() {
        try {
            return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    function saveStatusMap(map) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
        } catch (e) {
            // storage unavailable (private mode etc.) — fall back to session-only state
        }
    }

    var statusMap = loadStatusMap();

    function cardStatus(card) {
        var key = card.dataset.key;
        return (key && statusMap[key]) || 'active';
    }

    function cardMatches(card) {
        var status = cardStatus(card);
        var statusOk = (activeStatus === 'all') || (status === activeStatus);
        return statusOk &&
            (activeSeverity === 'all' || card.dataset.severity === activeSeverity) &&
            (activeCategory === 'all' || card.dataset.category === activeCategory);
    }

    function applyMark(card, status) {
        var key = card.dataset.key;
        if (!key) {
            return;
        }
        if (statusMap[key] === status) {
            delete statusMap[key];
            card.classList.remove('is-marked');
            Array.from(card.querySelectorAll('.comment-mark-btn')).forEach(function(btn) {
                btn.classList.toggle('is-marked', false);
            });
        } else {
            statusMap[key] = status;
            card.classList.add('is-marked');
            Array.from(card.querySelectorAll('.comment-mark-btn')).forEach(function(btn) {
                btn.classList.toggle('is-marked', btn.dataset.mark === status);
            });
        }
        saveStatusMap(statusMap);
        refreshStatusCounts();
        updateFilterState();
    }

    function updateFilterState() {
        filters.forEach(function(filter) {
            const kind = filter.dataset.filterKind;
            const activeValue = kind === 'severity' ? activeSeverity : activeCategory;
            const isActive = activeValue === filter.dataset.filterValue;
            filter.classList.toggle('is-active', isActive);
            filter.setAttribute('aria-pressed', String(isActive));
        });

        const showMarked = showMarkedToggle && showMarkedToggle.checked;
        let visibleCount = 0;
        let anyMarked = false;
        groups.forEach(function(group) {
            const cards = Array.from(group.querySelectorAll('[data-comment-card]'));
            let groupVisibleCount = 0;
            cards.forEach(function(card) {
                const marked = cardStatus(card) !== 'active';
                if (marked) {
                    anyMarked = true;
                }
                const visible = cardMatches(card) && (showMarked || !marked);
                card.hidden = !visible;
                if (visible) {
                    groupVisibleCount++;
                    visibleCount++;
                }
            });
            group.hidden = groupVisibleCount === 0;
            const count = group.querySelector('[data-comment-count]');
            if (count) {
                count.textContent = groupVisibleCount + ' comment' + (groupVisibleCount === 1 ? '' : 's');
            }
        });

        if (emptyState) {
            emptyState.hidden = visibleCount !== 0;
        }
        if (statusNote) {
            statusNote.hidden = !(anyMarked && !showMarked);
        }
    }

    function refreshStatusCounts() {
        var counts = {all: 0, active: 0, fixed: 0, solved: 0, ignored: 0};
        Array.from(document.querySelectorAll('[data-comment-card]')).forEach(function(card) {
            counts.all++;
            counts[cardStatus(card)] = (counts[cardStatus(card)] || 0) + 1;
        });
        filters.filter(function(f) { return f.dataset.filterKind === 'status'; }).forEach(function(chip) {
            var value = chip.dataset.filterValue;
            if (counts.hasOwnProperty(value)) {
                var text = chip.textContent.split(':')[0];
                chip.textContent = text + ': ' + counts[value];
                // Keep chips for zero-count statuses present but hidden via display none
                // only when there are no matching comments and the chip is not the All chip.
                chip.style.display = (value !== 'all' && counts[value] === 0) ? 'none' : '';
            }
        });
    }

    filters.forEach(function(filter) {
        filter.addEventListener('click', function() {
            const kind = filter.dataset.filterKind;
            const value = filter.dataset.filterValue;
            if (kind === 'severity') {
                activeSeverity = activeSeverity === value ? 'all' : value;
            } else if (kind === 'category') {
                activeCategory = activeCategory === value ? 'all' : value;
            } else {
                activeStatus = activeStatus === value ? 'all' : value;
            }
            updateFilterState();
        });
    });

    document.querySelectorAll('.comment-mark-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const card = btn.closest('[data-comment-card]');
            if (card) {
                applyMark(card, btn.dataset.mark);
            }
        });
    });

    if (showMarkedToggle) {
        showMarkedToggle.addEventListener('change', function() {
            updateFilterState();
        });
    }

    // Restore previously marked cards on load
    Array.from(document.querySelectorAll('[data-comment-card]')).forEach(function(card) {
        const status = cardStatus(card);
        if (status !== 'active') {
            card.classList.add('is-marked');
            Array.from(card.querySelectorAll('.comment-mark-btn')).forEach(function(btn) {
                btn.classList.toggle('is-marked', btn.dataset.mark === status);
            });
        }
    });
    refreshStatusCounts();
    updateFilterState();
})();
