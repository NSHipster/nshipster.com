# frozen_string_literal: true

require 'nokogiri'

module Jekyll
  module UnwrapFilter
    def unwrap(input)
      return '' if input.nil? || input.empty?

      fragment = Nokogiri::HTML::DocumentFragment.parse(input)
      fragment.children.map(&:inner_html).join(' ')
    end
  end
end

Liquid::Template.register_filter(Jekyll::UnwrapFilter)
