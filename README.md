# NSHipster.com

[NSHipster](https://nshipster.com) is a journal of the overlooked bits in
Swift, Objective-C and Cocoa.
Updated weekly.

This repository hosts the source code that generates and deploys
[NSHipster.com](https://nshipster.com).
For the articles themselves,
see [this repository](https://github.com/nshipster/articles).

---

## Requirements

- Git 1.5.2+
- Ruby 2.4.3+
- [Bundler](https://bundler.io)

## Running Locally

First, clone the repository by opening Terminal.app
and running the following commands:

```terminal
$ git clone git@github.com:NSHipster/nshipster.com.git
$ cd nshipster.com
```

NSHipster is built using
[Jekyll](https://github.com/jekyll/jekyll),
a blog-aware, static site generator in Ruby.

You can run the site locally with the following commands:

```terminal
$ bundle install
$ bundle exec jekyll serve
```

Now open the server address in a web browser to see a local copy of the site
(by default, Jekyll serves to localhost on port 4000):

```terminal
$ open http://localhost:4000
```

## Synchronizing Articles

Articles are located in the `_posts` directory,
which is a subtree corresponding to the
[articles repository](https://github.com/nshipster/articles).

Git subtrees are similar to submodules,
but have a slightly different workflow.

To pull in the latest changes from the articles repository,
run the following command:

```terminal
$ rake articles:pull
```

If you commit any changes to files in the `_posts` directory,
be sure to push those changes to the articles repository.
You can do this by running the following command:

```terminal
$ rake articles:push
```

## Deploying

NSHipster.com is hosted by [Netlify](https://netlify.com).
The site is configured with continuous deployment
such that any push to the `master` branch on this repository
automatically triggers a build and deploys the site, if successful.

Users with Push access can deploy the site by running the following command:

```terminal
$ git push origin master
```

You can monitor the status of a deploy in real-time
[on this dashboard](https://app.netlify.com/sites/nshipster/deploys/).

## Contact

Follow NSHipster on Twitter
([@NSHipster](https://twitter.com/NSHipster))

## License

All code is published under the
[MIT License](http://opensource.org/licenses/MIT).

All content is released under the
[Creative Commons BY-NC License](http://creativecommons.org/licenses/by-nc/4.0/).

NSHipster® and the NSHipster Logo are registered trademarks of NSHipster, LLC.
