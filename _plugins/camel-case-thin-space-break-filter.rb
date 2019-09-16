# frozen_string_literal: true

module Jekyll
  module CamelCaseThinSpaceBreakFilter
    REGEX = /(?:([a-z]{2,})([A-Z]+))/.freeze

    def camel_break(string)
      string.gsub(REGEX, "\\1\u200B\\2")
    end
  end
end

Liquid::Template.register_filter(Jekyll::CamelCaseThinSpaceBreakFilter)
