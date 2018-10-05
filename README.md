# NSHipster.com

[NSHipster](https://nshipster.com) is a journal of the overlooked bits in
Swift, Objective-C and Cocoa.
Updated weekly.

This repository hosts the source code that generates and deploys
[NSHipster.com](https://nshipster.com) and its translations.
For the articles themselves,
see [this repository](https://github.com/nshipster/articles).

---

## Requirements

- Git 2.16.2+
- Ruby 2.4.3+
- [Bundler](https://bundler.io)

## Running Locally

First, clone the repository by opening Terminal.app
and running the following commands:

```terminal
$ git clone git@github.com:NSHipster/nshipster.com.git
$ cd nshipster.com
```

Next, clone the articles submodules
with the following commands:

```terminal
$ git submodule update --init --remote --merge
```

NSHipster is built using
[Jekyll](https://github.com/jekyll/jekyll),
a blog-aware, static site generator in Ruby.

Download and update the project dependencies with Bundler
using the command:

```terminal
$ bundle install
```

To run the site locally,
you must specify the configuration file
corresponding to the NSHipster website you'd like to build
(i.e. NSHipster.com, NSHipster.cn, etc.).
You can run the site locally with the following commands:

```terminal
$ bundle exec jekyll serve --config _config/default.yml,_config/$DOMAIN.yml --trace
```

Now open the server address in a web browser to see a local copy of the site
(by default, Jekyll serves to localhost on port 4000):

```terminal
$ open http://localhost:4000
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
[MIT License](https://opensource.org/licenses/MIT).

All content is released under the
[Creative Commons BY-NC License](https://creativecommons.org/licenses/by-nc/4.0/).

NSHipster® and the NSHipster Logo
are registered trademarks of Read Evaluate Press, LLC.
