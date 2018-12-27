# frozen_string_literal: true

ruby '2.4.3'
source 'https://rubygems.org'

gem 'jekyll', git: "https://github.com/jekyll/jekyll.git"
gem 'rack', '>= 2.0.6'

gem 'sprockets', '~> 4.0.beta', require: false
gem 'uglifier', '~> 4.0'

gem 'kramdown'
gem 'nokogiri'
gem 'rouge'
gem 'sassc'

gem 'liquid-c'

group :jekyll_plugins do
  gem 'jekyll-assets'
  gem 'jekyll-commonmark'
  gem 'jekyll-include-cache'
  gem 'jekyll-last-modified-at'
  gem 'jekyll-tagging-related_posts'
  gem 'jekyll-tidy'
end

group :development do
  gem 'foreman'
  gem 'rake'
end

# Windows does not include zoneinfo files, so bundle the tzinfo-data gem
gem 'tzinfo-data', platforms: %i[mingw mswin x64_mingw jruby]
