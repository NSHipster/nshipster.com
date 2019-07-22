# frozen_string_literal: true

require 'rouge'

module Rouge
  module Lexers
    class JWT < RegexLexer
      tag 'jwt'
      filenames '*.jwt'

      title 'JSON Web Token (JWT)'
      desc 'A compact URL-safe means of representing claims to be transferred between two parties.'

      start { push :root }

      state :root do
        rule %r{^([A-Za-z0-9\-_=]+)(\.)([A-Za-z0-9\-_=]+)(\.?)([A-Za-z0-9\-_.+/=]*)$} do |m|
          token Keyword, m[1]
          token Punctuation, m[2]
          token Literal::Number, m[1]
          token Punctuation, m[4]
          token Name::Variable, m[1]
        end
      end
    end
  end
end
