{% raw %}
```handlebars
{{#people}}{{fullName}}{{/people}}
```
{% endraw %}

{% comment %}
This comment is removed.
{% endcomment %}

{% assign description = page.excerpt | strip %}
{% capture greeting %}Hello from {{ page.title }}{% endcapture %}

The description is "{{ description }}", and the greeting is "{{ greeting }}".
The year is {{ site.time | date: '%Y' }}.
