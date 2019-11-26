# frozen_string_literal: true

source 'https://rubygems.org'

gem 'jekyll', git: 'https://github.com/jekyll/jekyll.git'
gem 'rack', '>= 2.0.6'

gem 'sprockets', '~> 4.0.beta'
gem 'uglifier', '~> 4.0'

gem 'kramdown'

gem 'rouge', git: 'https://github.com/NSHipster/rouge.git',
             branch: 'swift-with-placeholder-token'

gem 'nokogiri'
gem 'sassc'

gem 'liquid-c'

gem 'twitter_cldr'

group :jekyll_plugins do
  gem 'jekyll-assets'
  gem 'jekyll-include-cache'
  gem 'jekyll-tidy'
  gem 'jekyll-scholar'
end

group :development do
  gem 'foreman'
  gem 'rake'
end

# Windows does not include zoneinfo files, so bundle the tzinfo-data gem
gem 'tzinfo-data', platforms: %i[mingw mswin x64_mingw jruby]
