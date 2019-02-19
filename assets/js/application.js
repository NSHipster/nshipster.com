'use strict';

(function () {
    const delay = 300;

    const keys = {
        end: 35,
        home: 36,
        left: 37,
        up: 38,
        right: 39,
        down: 40,
    };

    const direction = {
        37: -1,
        39: 1,
    };

    document.querySelectorAll('[role="tablist"]').forEach((tablist) => {
        const tabs = tablist.querySelectorAll('[role="tab"]');
        const panels = tablist.parentElement.querySelectorAll('[role="tabpanel"]');

        const clickEventListener = (event) => {
            const target = event.target;

            activateTab(target, false);

            for (const language of ['swift', 'objective-c']) {
                if (target.classList.contains(language)) {
                    document.querySelectorAll(`[role="tab"].${language}`).forEach((tab) => {
                        activateTab(tab, false);
                    })
                }
            }
        };

        const keydownEventListener = (event) => {
            const key = event.keyCode;

            switch (key) {
                case keys.end:
                    event.preventDefault();
                    activateTab(tabs[tabs.length - 1]);
                    break;
                case keys.home:
                    event.preventDefault();
                    activateTab(tabs[0]);
                    break;
                case keys.up:
                case keys.down:
                    determineOrientation(event);
                    break;
            };
        };

        const keyupEventListener = (event) => {
            const key = event.keyCode;
            const target = event.target;

            tabs.forEach(tab => {
                tab.addEventListener('focus', focusEventListener);
            });

            if (direction[key]) {
                if (target.dataset.index !== undefined) {
                    if (tabs[target.dataset.index + direction[pressed]]) {
                        tabs[target.dataset.index + direction[pressed]].focus();
                    } else if (pressed === keys.left || pressed === keys.up) {
                        tabs[tabs.length - 1].focus();
                    } else if (pressed === keys.right || pressed == keys.down) {
                        tabs[0].focus();
                    };
                };
            };
        };

        const focusEventListener = (event) => {
            const target = event.target;

            const handler = (target) => {
                focused = document.activeElement;

                if (target === focused) {
                    activateTab(target, false);
                };
            };

            setTimeout(handler, delay, target);
        };

        const activateTab = (tab, setFocus) => {
            tabs.forEach(tab => {
                tab.setAttribute('tabindex', '-1');
                tab.setAttribute('aria-selected', 'false');
                tab.removeEventListener('focus', focusEventListener);
            });

            panels.forEach(panel => {
                panel.setAttribute('hidden', 'hidden');
            });

            tab.removeAttribute('tabindex');

            tab.setAttribute('aria-selected', 'true');

            var controls = tab.getAttribute('aria-controls');
            document.getElementById(controls).removeAttribute('hidden');

            if (setFocus) {
                tab.focus();
            };
        };

        for (let index = 0; index < tabs.length; index++) {
            const tab = tabs[index];
            tab.addEventListener('click', clickEventListener);
            tab.addEventListener('keydown', keydownEventListener);
            tab.addEventListener('keyup', keyupEventListener);
            tab.dataset.index = index;
        }
    });
}());

setTimeout(function () {
    if (
        document.location.pathname === "/" &&
        matchMedia("(hover: none)").matches
    ) {
        document.querySelector("#logo svg").classList.add("animated");
    }
}, 1000);
