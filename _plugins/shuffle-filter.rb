# frozen_string_literal: true

module Jekyll
  module ShuffleFilter
    def shuffle(input = [])
      input.sort_by { rand }
    rescue StandardError
      input
    end
  end
end

Liquid::Template.register_filter(Jekyll::ShuffleFilter)
