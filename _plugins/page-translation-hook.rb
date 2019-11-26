# frozen_string_literal: true

Jekyll::Hooks.register :pages, :pre_render do |page|
  page.data['translations'] = page.site.config['domains'].keys if page.index?
end
