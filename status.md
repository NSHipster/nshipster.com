---
layout: page
title: Article Status
permalink: /status
retired: true
---

The common swift (_Apus apus_) can travel at speeds over 100km/h.
The Swift programming language ---
true to its name and namesake ---
is similarly fast-moving,
frequently introducing new language features and syntax rules.
As a result,
some of our articles may become incorrect or outdated over time.

We do our best to keep things fresh,
with new updates to existing articles made every week,
and invite you to help us find and correct any mistakes you find by
[opening a new issue on our GitHub repository](https://github.com/NSHipster/articles/issues/new).

In the meantime,
please consult the table below
for guidance on when each of our articles was last updated,
and which version of Swift it's targeting:

<table id="status">
    <caption>
        "t.b.c." indicates that an article has not yet been translated to Swift<br/>
        "n/a" notes that a Swift translation would not be useful or appropriate.
    </caption>
    <thead>
        <tr>
            <th>Article</th>
            <th>Swift Version</th>
            <th>Last Review</th>
        </tr>
    </thead>
    <tbody>
        {% assign sorted = site.posts | sort: 'title' %}
        {% for post in sorted %}
            <tr>
                <td><a href="{{ post.url }}">{{ post.title | camel_break }}</a></td>
                <td class="version">
                    {% if post.status.swift == "n/a" %}
                        <em>n/a</em>
                    {% elsif post.status.swift == "t.b.c." %}
                        <strong>t.b.c.</strong>
                    {% else %}
                        {{ post.status.swift }}
                    {% endif %}
                </td>
                <td>
                    {% assign last_review = post.status.reviewed | default: post.date %}
                    {% capture date_format %}{% t format.date %}{% endcapture %}
                    {{ last_review | date: date_format }}
                </td>
            </tr>
        {% endfor %}
    </tbody>
</table>
