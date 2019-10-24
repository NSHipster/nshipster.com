# frozen_string_literal: true

module Jekyll
  class SearchIndexGenerator < Generator
    priority :low

    def generate(site)
      index = site.posts.docs.reverse
                  .filter { |post| !post.data['retired'] }
                  .map do |post|
        {
          url: site.config['url'] + post.url,
          title: post.data['title'],
          category: post.data['category'],
          content: post.data['excerpt']
        }
      end

      File.open('_functions/search/index.json', 'w') do |f|
        f.puts index.to_json
      end
    end
  end
end
