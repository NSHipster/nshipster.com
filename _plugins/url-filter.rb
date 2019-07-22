# frozen_string_literal: true

require 'uri'

module Jekyll
  module URLFilter
    def host(input)
      return input unless uri = URI(input)

      uri.host
    end
  end
end

Liquid::Template.register_filter(Jekyll::URLFilter)
