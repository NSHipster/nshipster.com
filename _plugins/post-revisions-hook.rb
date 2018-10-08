require 'date'
require 'pp'

Jekyll::Hooks.register :posts, :pre_render do |post|
    if post.data['revisions']
        raise unless last_revised_on = Time.parse(post.data['revisions'].keys.max)
        post.data['updated_on'] = last_revised_on
        post.data['last_revised_on'] = last_revised_on
        post.data['revision_description'] = post.data['revisions'][last_revised_on]
    else
        post.data['updated_on'] = post.date
    end
end
