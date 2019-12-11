# frozen_string_literal: true

require 'yaml'

require 'jekyll'
require 'nokogiri'
require 'active_support/inflector'

module Jekyll
  module Converters
    class Markdown
      # :nodoc:
      class NSHipsterProcessor
        def initialize(config)
          @kramdown = KramdownParser.new(config)
        end

        def convert(content)
          cache.getset(content) do
            content.gsub!('<#...#>', "\uFFFC")
            html = @kramdown.convert(content)
            doc = Nokogiri::HTML::DocumentFragment.parse(html)

            remove_proprietary_attributes!(doc)
            secure_links_to_cross_origin_destinations!(doc)
            transform_apple_trademarks!(doc)
            transform_code_symbols!(doc)
            transform_placeholder_tokens!(doc)
            add_heading_anchors!(doc)
            unnest_code_listing_markup!(doc)
            consolidate_consecutive_code_listings!(doc)
            improve_accessibility!(doc)
            style_optional_placeholders!(doc)
            delineate_flim_flam!(doc)

            doc.to_html.gsub("\uFFFC", '<var class="placeholder">…</var>')
          end
        end

        private

        def cache
          @@cache ||= Jekyll::Cache.new('ConvertMarkdown')
        end

        def remove_proprietary_attributes!(doc)
          doc.css('[markdown]').each do |element|
            element.remove_attribute('markdown')
          end
        end

        def transform_code_symbols!(doc)
          doc.css(':not(pre) code').each do |code|
            code.remove_attribute('class')
            code.inner_html = code.inner_html.gsub(/(?:([a-z])([A-Z]+))/, '\\1<wbr/>\\2')
          end
        end

        def transform_apple_trademarks!(doc)
          doc.css('p, li, td').each do |p|
            p.inner_html = p.inner_html.gsub(/iPhone X([SR])/, 'iPhone X<small>\\1</small>')
          end
        end

        def secure_links_to_cross_origin_destinations!(doc)
          doc.css('a[href]').each do |a|
            href = a.attr('href')
            next if href =~ %r{^/|#{ENV['DOMAIN']}}

            a['rel'] = 'noopener noreferrer'
          end
        end

        def transform_placeholder_tokens!(doc)
          doc.css('code').each do |code|
            code.inner_html = code.inner_html.gsub(/&lt;#\s*(.*?)\s*#&gt;/, '<var class="placeholder">\\1</var>')
          end
        end

        def add_heading_anchors!(doc)
          selector = (1..6).map { |n| "h#{n}" }.join(', ')
          doc.css(selector).each do |h|
            next unless id = h.attr('id')

            id = ActiveSupport::Inflector.parameterize(id)

            h.remove_attribute('id')
            h.prepend_child(%(<a class="anchor" aria-hidden="true" id="#{id}" href="##{id}"></a>))
          end
        end

        def unnest_code_listing_markup!(doc)
          doc.css('div.highlighter-rouge').each do |div|
            class_name = div.classes.detect { |c| !c.match?(/rouge/) }
            language = case class_name
                       when /swift/ then 'Swift'
                       when /objc|objective-c/ then 'Objective-C'
                       when /json/ then 'JSON'
                       when /python/ then 'Python'
                       when /ruby/ then 'Ruby'
                       when /javascript/ then 'JavaScript'
                       when /terminal/ then 'Terminal'
                       when /html/ then 'HTML'
                       when /xml/ then 'XML'
                       when /jwt/ then 'JWT'
                       when /applescript/ then 'AppleScript'
                       when nil then ''
                       else
                         class_name.gsub(/language-/, '')
                       end

            pre = div.at('pre')
            pre['class'] = 'highlight'
            pre['data-lang'] = language

            div.swap(pre)
          end
        end

        def consolidate_consecutive_code_listings!(doc)
          doc.css('.highlight').each do |pre|
            next if pre.parent['class'] == 'highlight-group'

            group = pre.wrap(%(<div class="highlight-group">)).parent

            while sibling = group.at_xpath('following-sibling::node()[not(self::text()[not(normalize-space())])][1]')
              break unless sibling.classes.include?('highlight')

              group.add_child(sibling)
            end

            group.swap(group.child) if group.children.count == 1
          end

          number = 1
          doc.css('div.highlight-group').each do |group|
            group.prepend_child('<div role="tablist" aria-label="Languages"/>')
            tablist = group.at('[role="tablist"]')

            group.css('.highlight').each_with_index do |div, index|
              language = div['data-lang'] || 'text'

              id = "code-listing-#{number}-#{language.downcase}"
              div['id'] = id.to_s
              div['role'] = 'tabpanel'
              div['tabindex'] = '0'
              div['aria-labelledby'] = "#{id}-tab"
              div['hidden'] = 'hidden' unless index == 0

              tablist.add_child(%(
                  <button role="tab"
                          role="tablist"
                          id="#{id}-tab"
                          class="#{language.downcase}"
                          aria-label="Languages"
                          aria-controls="#{id}"
                          aria-selected="#{index == 0 ? 'true' : 'false'}"
                          tabindex="-1">
                      #{language}
                  </button>
              ))
            end
            number += 1
          end
        end

        def improve_accessibility!(doc)
          doc.css('img[src$=".svg"]').each do |img|
            img['role'] = 'img'
          end

          doc.css('img:not([alt])').each do |img|
            img['alt'] = ''
          end
        end

        def style_optional_placeholders!(doc)
            doc.css('var.placeholder').each do |var|
                next unless var.text.match? /[\[\]]/
                var.add_class("optional")
                var['title'] = "Optional"
                var.inner_html = var.inner_html.gsub(/[\[\]]/, "")
            end
        end

        def delineate_flim_flam!(doc)
          if divider = (doc.at_css('hr') || doc.at_css('h2'))
            divider.add_next_sibling(%(<a id="get-on-with-it"/>))
          end
        end
      end
    end
  end
end
