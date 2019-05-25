# frozen_string_literal: true

require 'uri'

Jekyll::Hooks.register :posts, :pre_render do |post|
    language = post.site.config['lang']

    repository_name = case language
                      when /^en/ then "articles"
                      when /^es/ then "articles-es"
                      when /^fr/ then "articles-fr"
                      when /^ko/ then "articles-ko"
                      when /^zh-Hans/ then "articles-zh-Hans"
                      else
                          raise "Unknown language: #{language}"
                      end

    filename = File.basename(post.path)

    post.data['commit_history_url'] = "https://github.com/nshipster/#{repository_name}/commits/master/#{filename}"
end
