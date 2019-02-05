# frozen_string_literal: true

require 'yaml'

require 'jekyll'
require 'nokogiri'

module Jekyll
  module Converters
    class Markdown
      # :nodoc:
      class NSHipsterProcessor
        def initialize(config)
          @kramdown = KramdownParser.new(config)
        end

        def convert(content)
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

          doc.to_html
        end

        private

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
            next if href =~ /^\/|#{ENV['DOMAIN']}/

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
            h.remove_attribute('id')
            h.prepend_child(%(<a class="anchor" aria-hidden="true" id="#{id}" href="##{id}"></a>))
          end
        end

        def unnest_code_listing_markup!(doc)
          doc.css('div.highlighter-rouge').each do |div|
            language = case div['class']
                       when /swift/ then 'Swift'
                       when /objc|objective-c/ then 'Objective-C'
                       when /json/ then 'JSON'
                       when /javascript/ then 'JavaScript'
                       when /terminal/ then 'Terminal'
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
              language = div['data-lang']

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
      end
    end
  end
end
