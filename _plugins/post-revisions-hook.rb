require 'date'
require 'pp'

Jekyll::Hooks.register :posts, :pre_render do |post|
    if post.data['revisions']
        latest_revision = post.data['revisions'].keys.max_by { |k| Time.parse(k) }
        raise unless latest_revision and last_revised_on = Time.parse(latest_revision)
        post.data['revision_description'] = post.data['revisions'][latest_revision]
        post.data['last_revised_on'] = last_revised_on
        post.data['updated_on'] = last_revised_on
    else
        post.data['updated_on'] = post.date
    end
end
