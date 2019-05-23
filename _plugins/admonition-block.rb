# frozen_string_literal: true

module Jekyll
  class AdmonitionBlock < Liquid::Block
    def initialize(tag_name, arguments, tokens)
      super

      @type = tag_name
    end

    def render(context)
      content = super
      <<~EOD
        <aside class="admonition #{@type}" markdown="1">
         #{content}
        </aside>
      EOD
    end
  end
end

%w[info warning error].each do |admonition|
  Liquid::Template.register_tag(admonition, Jekyll::AdmonitionBlock)
end
