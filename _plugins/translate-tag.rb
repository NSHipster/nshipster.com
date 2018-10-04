# frozen_string_literal: true

module Jekyll
  class Site
    attr_accessor :translations
  end

  class TranslateTag < Liquid::Tag
    def initialize(tag_name, key, tokens)
      super
      @key = key.strip
    end

    def render(context)
      key = key(context)
      translation = translations(context).dig(*key.split('.'))

      if translation.nil? || translation.empty?
        raise "Missing i18n key: #{lang}: #{key}"
      end

      translation
    end

    private

    def key(context)
      key = if context[@key].to_s != ''
              context[@key].to_s
            else
              @key
            end

      key = Liquid::Template.parse(key).render(context)
      raise "Invalid key #{key}" unless key.is_a?(String)

      key
    end

    def translations(context)
      site = context.registers[:site]
      site.translations ||= {}

      lang = site.config['lang']
      unless site.translations.key?(lang)
        puts "Loading translations from #{site.source}/_i18n/#{lang}.yml"
        site.translations[lang] = YAML.load_file("#{site.source}/_i18n/#{lang}.yml")
      end

      site.translations[lang]
    end
  end
end

Liquid::Template.register_tag('t', Jekyll::TranslateTag)
Liquid::Template.register_tag('translate', Jekyll::TranslateTag)
