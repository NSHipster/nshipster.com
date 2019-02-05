//= require vendor/zepto.js
//= require vendor/zepto.cookie.js

$(document).ready(function () {
    var group = [];
    $("div.highlighter-rouge").each(function () {
        var language = null;
        var classAttr = $(this).attr("class");
        if (classAttr.includes("language-swift")) {
            language = "Swift";
        } else if (classAttr.includes("language-objc")) {
            language = "Objective-C";
        } else if (classAttr.includes("language-json")) {
            language = "JSON";
        } else if (classAttr.includes("language-javascript")) {
            language = "JavaScript";
        } else if (classAttr.includes("language-terminal")) {
            language = "Terminal";
        }

        if (language !== null) {
            $(this)
                .find("code")
                .data("lang", language);
        }

        group.push($(this));

        if (
            !$(this)
            .next()
            .hasClass("highlighter-rouge")
        ) {
            var container = $('<div class="highlight-group"></div>');
            container.insertBefore(group[0]);

            for (i in group) {
                group[i].appendTo(container);
            }

            group = [];
        }
    });

    $(".highlight-group").each(function () {
        var languages = [];
        $(this)
            .find($("code"))
            .each(function () {
                var language = $(this).data("lang");
                if (language) {
                    languages.push(language);
                }
            });

        $(this)
            .children(".highlighter-rouge:not(:first-child)")
            .hide();

        var span = $('<span class="language-toggle"></span>');
        for (i in languages) {
            var language = languages[i];
            var a = $('<a data-lang="' + language + '">' + language + "</a>");
            if (i == 0) {
                a.addClass("active");
            }
            span.append(a);
        }

        $(this).prepend(span);
    });

    var showAllWithLanguage = function (lang) {
        $("a[data-lang=" + lang + "]").each(function () {
            $(this)
                .siblings("a")
                .removeClass("active");
            $(this).addClass("active");
            $(this)
                .parent()
                .siblings(".highlighter-rouge")
                .each(function () {
                    if (
                        $(this)
                        .find("code")
                        .data("lang") === lang
                    ) {
                        $(this).show();
                    } else {
                        $(this).hide();
                    }
                });
        });
    };

    $("a[data-lang]").on("click", function () {
        var lang = $(this).data("lang");
        if (["Swift", "Objective-C"].includes(lang)) {
            $.fn.cookie("pref-lang", lang, {
                expires: 3650,
                path: "/"
            });
        }
        showAllWithLanguage(lang);
    });

    var preferredLanguage = $.fn.cookie("pref-lang");
    if (preferredLanguage) {
        showAllWithLanguage(preferredLanguage);
    }
});

setTimeout(function () {
    if (
        document.location.pathname === "/" &&
        matchMedia("(hover: none)").matches
    ) {
        document.querySelector("#logo svg").classList.add("animated");
    }
}, 1000);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js');

        navigator.serviceWorker.ready.then(function (registration) {
            console.log('Service worker registered on scope', registration.scope);
        });
    });
}
