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

    const tablists = document.querySelectorAll('[role="tablist"]');
    tablists.forEach((tablist) => {
        const tabs = tablist.querySelectorAll('[role="tab"]');
        const panels = tablist.parentElement.querySelectorAll('[role="tabpanel"]');

        const clickEventListener = (event) => {
            const target = event.target;

            activateTab(target, false);
        };

        const keydownEventListener = (event) => {
            const {
                keyCode
            } = event;

            switch (keyCode) {
                case keys.end:
                    event.preventDefault();
                    tabs[tabs.length - 1].dispatchEvent(new Event('activate'));
                    break;
                case keys.home:
                    event.preventDefault();
                    tabs[0].dispatchEvent(new Event('activate'));
                    break;
                case keys.up:
                case keys.down:
                    determineOrientation(event);
                    break;
            };
        };

        const keyupEventListener = (event) => {
            const {
                keyCode,
                target
            } = event;

            tabs.forEach(tab => {
                tab.addEventListener('focus', focusEventListener);
            });

            if (direction[keyCode]) {
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
            const {
                target
            } = event;

            const handler = (target) => {
                focused = document.activeElement;

                if (target === focused) {
                    target.dispatchEvent(new Event('activate'));
                };
            };

            setTimeout(handler, delay, target);
        };

        const activateEventListener = (event) => {
            const {
                target
            } = event;

            tabs.forEach(tab => {
                tab.setAttribute('tabindex', '-1');
                tab.setAttribute('aria-selected', 'false');
                tab.removeEventListener('focus', focusEventListener);
            });

            panels.forEach(panel => {
                panel.setAttribute('hidden', 'hidden');
            });

            target.removeAttribute('tabindex');
            target.setAttribute('aria-selected', 'true');

            var controls = target.getAttribute('aria-controls');
            document.getElementById(controls).removeAttribute('hidden');

            // if (setFocus) {
            //     tab.focus();
            // };
        };

        for (let index = 0; index < tabs.length; index++) {
            const tab = tabs[index];
            tab.addEventListener('click', clickEventListener);
            tab.addEventListener('keydown', keydownEventListener);
            tab.addEventListener('keyup', keyupEventListener);
            tab.addEventListener('activate', activateEventListener);

            tab.dataset.index = index;
        }
    });

    for (const language of ['swift', 'objective-c']) {
        if (target.classList.contains(language)) {
            document.querySelectorAll(`[role="tab"].${language}`).forEach((tab) => {
                tab.dispatchEvent(new Event('activate'));
            })
        }
    }
}());

setTimeout(function () {
    if (
        document.location.pathname === "/" &&
        matchMedia("(hover: none)").matches
    ) {
        document.querySelector("#logo svg").classList.add("animated");
    }
}, 1000);
