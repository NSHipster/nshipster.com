# frozen_string_literal: true

require 'twitter_cldr'

module Jekyll
  module LocalizationFilter
    def as_language_code(input, locale = nil)
      return '中文' if input == 'zh-Hans' && locale == 'zh-Hans'

      code = TwitterCldr.convert_locale(input)
      TwitterCldr::Shared::Languages.from_code_for_locale(code, locale || :en)
    end

    def to_sentence(list)
      formatter = TwitterCldr::Formatters::ListFormatter.new(current_locale.language)
      formatter.format(list.map(&:strip).reject(&:empty?))
    end

    private

    def current_locale
      # TwitterCldr.convert_locale(Jekyll.sites.first.config['lang'])
      TwitterCldr::Shared::Locale.parse(Jekyll.sites.first.config['lang']).maximize
    end
  end
end

Liquid::Template.register_filter(Jekyll::LocalizationFilter)
