# frozen_string_literal: true

Jekyll::Hooks.register :posts, :pre_render do |post|
  directory = File.expand_path('../../..', post.path)
  filename = File.basename(post.path)
  slug = filename.sub(/\A\d{4}-\d{,2}-\d{,2}-/, '')
  translations = Dir["#{directory}/**/*#{slug}"].reject { |f| f == post.path }

  post.data['translations'] = []
  translations.each do |translation|
    next unless language = File.expand_path('../..', translation).split('/').last
    post.data['translations'] << language
  end
end
