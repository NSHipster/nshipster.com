module Jekyll
  module CamelCaseThinSpaceBreakFilter
    REGEX = /(?:([a-z])([A-Z]+))/

    def camel_break(string)
      string.gsub(REGEX, "\\1\u200B\\2")
    end
  end
end

Liquid::Template.register_filter(Jekyll::CamelCaseThinSpaceBreakFilter)
