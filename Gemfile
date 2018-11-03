# frozen_string_literal: true

ruby '2.4.3'
source 'https://rubygems.org'

gem 'jekyll', '~> 3.8'

gem 'sprockets', '~> 4.0.beta', require: false
gem 'uglifier', '~> 4.0'

gem 'kramdown'
gem 'nokogiri'
gem 'rouge'
gem 'sassc'

group :jekyll_plugins do
  gem 'jekyll-assets'
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
