---
layout: post
title: "Reader Submissions - New Year's 2013"
category: "Reader Submissions"
published: true
description: "In celebration of the forthcoming `year++`, I thought it'd be fun to compile a list of some of your favorite tips and tricks of the trade. Readers were asked to submit their favorite piece of Objective-C trivia, framework arcana, hidden Xcode feature, or anything else they thought is cool."
---

In celebration of the forthcoming `year++`, I thought it'd be fun to compile a list of some of _your_ favorite tips and tricks of the trade--to give y'all a chance to show off some of your NSHipster cred.

Thanks to [Cédric Luthi](https://github.com/0xced), [Jason Kozemczak](https://github.com/jaykz52), [Jeff Kelley](https://github.com/SlaunchaMan), [Joel Parsons](https://github.com/joelparsons), [Maximilian Tagher](https://github.com/MaxGabriel), [Rob Mayoff](https://github.com/mayoff), [Vadim Shpakovski](https://github.com/shpakovski), & [@alextud](https://github.com/alextud) for [answering the call](https://gist.github.com/4148342) with _excellent_ submissions. 

---


Associated Objects in Categories
--------------------------------

This first tip is so nice it was mentioned twice, both by [Jason Kozemczak](https://github.com/jaykz52) & [Jeff Kelley](https://github.com/SlaunchaMan).

Categories are a well-known feature of Objective-C, allowing new methods to be added to existing classes. Much less well known is that with some `objc` runtime hacking, you can add new _properties_ as well. Observe!

### NSObject+IndieBandName.h

    @interface NSObject (IndieBandName)
    @property (nonatomic, strong) NSString *indieBandName;
    @end

### NSObject+IndieBandName.m

    #import "NSObject+Extension.h"
    #import <objc/runtime.h>

    static const void *IndieBandNameKey = &IndieBandNameKey;    

    @implementation NSObject (IndieBandName)
    @dynamic indieBandName;

    - (NSString *)indieBandName {
        return objc_getAssociatedObject(self, IndieBandNameKey);
    }

    - (void)setIndieBandName:(NSString *)indieBandName {
        objc_setAssociatedObject(self, IndieBandNameKey, indieBandName, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }

    @end

This way, all of your objects can store and retrieve the name of their band, which--by the way--is performing this Wednesday night, and you should totally come.

While this is a cool trick and all, it should only be used as a method of last resort. Before you go this route, ask yourself if a particular property can't either be derived from existing values, or should be managed by another class.

A good example of an associated object is how [AFNetworking](https://github.com/AFNetworking/AFNetworking) adds a property for an image request operation in its [`UIImageView` category](https://github.com/AFNetworking/AFNetworking/blob/master/AFNetworking/UIImageView%2BAFNetworking.m#L39).

LLDB View Hierarchy Dump
------------------------

[Rob Mayoff](https://github.com/mayoff) responded with an obscure and powerful incantation to make debugging views a delight. Create `.lldbinit` in your home directory, if it doesn't already exist, and add the following:

### ~/.lldbinit

    command regex rd 's/^[[:space:]]*$/po [[[UIApplication sharedApplication] keyWindow] recursiveDescription]/' 's/^(.+)$/po [%1 recursiveDescription]/'

Now you can get a recursive hierarchy of any view in your iOS application with the LLDB debugger. You can try this for yourself by setting a breakpoint in a view controller, and type `rd self.view`. You may be surprised by what's under the hood with some of the built-in UI controls!


LLDB Print Contents of a `CGPathRef`
------------------------------------

While we're on the subject of LLDB, [Rob Mayoff](https://github.com/mayoff) sent in a useful incantation for printing out the contents of a `CGPathRef` from the debugger:

    p (void)CGPathPrint(pathRef, 0)

If you're doing any kind of complex Core Graphics drawing, be sure to keep this one handy.

Use `+initialize`, Not `+load`
------------------------------------

[Vadim Shpakovski](https://github.com/shpakovski) wrote in with some advice about class loading and initialization. There are two magical class methods in Objective-C: `+load` and `+initialize`, which are automatically called by virtue of the class being used. The difference between the two methods, however, has significant performance implications for your application.

[Mike Ash](http://www.mikeash.com/) has a [great explanation of this](http://www.mikeash.com/pyblog/friday-qa-2009-05-22-objective-c-class-loading-and-initialization.html):

> `+load` is invoked as the class is actually loaded, if it implements the method. This happens very early on. If you implement `+load` in an application or in a framework that an application links to, `+load` will run before `main()`. If you implement `+load` in a loadable bundle, then it runs during the bundle loading process.

> The `+initialize` method is invoked in a more sane environment and is usually a better place to put code than `+load`. `+initialize` is interesting because it's invoked lazily and may not be invoked at all. When a class first loads, `+initialize` is not called. When a message is sent to a class, the runtime first checks to see if `+initialize` has been called yet. If not, it calls it before proceeding with the message send.

**tl;dr: Implement `+initialize`, not `+load`, if you need this automatic behavior.**

`+initialize` is great for registering [`NSURLProtocol`](http://nshipster.com/nsurlprotocol/), [`NSValueTransformer`](NSValueTransformer), and [`NSIncrementalStore`](http://nshipster.com/nsincrementalstore/) subclasses, or any class that requires some kind of extra initialization step before being used.

Xcode Snippets
--------------

[Maximilian Tagher](https://github.com/MaxGabriel) gave a shout-out to the benefits of Xcode Snippets.

Great developers take pride in knowing their tools, and being able to use them to maximum effect. [For better](https://twitter.com/javisoto/status/285531250373046272) or [for worse](http://www.textfromxcode.com), this means knowing Xcode like the back of our hand. Verbose as Objective-C is, "do more by typing less" rings especially true as a productivity mantra, and [Xcode Snippets](http://developer.apple.com/library/mac/#recipes/xcode_help-source_editor/CreatingaCustomCodeSnippet/CreatingaCustomCodeSnippet.html#//apple_ref/doc/uid/TP40009975-CH14-SW1) are one of the best ways to do this.

If you're looking for a place to start, try downloading and forking [these Xcode Snippets](https://github.com/mattt/Xcode-Snippets).

Macro for Measuring Execution Time
----------------------------------

Here's a helpful macro for easily measuring the elapsed time for executing a particular block of code, sent in from [@alextud](https://github.com/alextud):

    NS_INLINE void MVComputeTimeWithNameAndBlock(const char *caller, void (^block)()) {
        CFTimeInterval startTimeInterval = CACurrentMediaTime();
        block();
        CFTimeInterval nowTimeInterval = CACurrentMediaTime();
        NSLog(@"%s - Time Running is: %f", caller, nowTimeInterval - startTimeInterval);
    }

    #define MVComputeTime(...) MVComputeTimeWithNameAndBlock(__PRETTY_FUNCTION__, (__VA_ARGS__))


Block Enumeration Methods
-------------------------

[Joel Parsons](https://github.com/joelparsons) submitted a great tip about using `-enumerateObjectsWithOptions:usingBlock:` in `NSArray` and other collection classes. By passing the `NSEnumerationConcurrent` option, you can get significant performance benefits over `NSFastEnumeration`'s `for...in`-style enumeration by executing the block concurrently.

However, be warned! Not all enumerations lend themselves to concurrent execution, so don't go around replacing all of your `for...in` blocks with `NSEnumerationConcurrent` willy-nilly, unless random crashing is something you like in an app.

Reverse-Engineered Implementation of `NSString` Equality Methods
----------------------------------------------------------------

Displaying his characteristic brilliance and familiarity of Cocoa internals [Cédric Luthi](https://github.com/0xced) submitted [a reverse-engineered implementation of the `NString` equality methods](https://gist.github.com/2275014). Fascinating!

Animate `NSLayoutConstraint.constant` 
-------------------------------------

This one goes out to all you fans of [Cocoa Auto Layout](https://developer.apple.com/library/mac/#documentation/UserExperience/Conceptual/AutolayoutPG/Articles/Introduction.html#//apple_ref/doc/uid/TP40010853), from [Vadim Shpakovski](https://github.com/shpakovski):

    viewConstraint.constant = <#Constant Value From#>;
    [view layoutIfNeeded];

    viewConstraint.constant = <#Constant Value To#>;
    [view setNeedsUpdateConstraints];

    [UIView animateWithDuration:ConstantAnimationDuration animations:^{
         [view layoutIfNeeded];
    }];

Attentive readers may have already noted this, but the code above would make an _excellent_ Xcode Snippet, by the way.

Printing `NSCache` Usage
------------------------

Finishing up this batch of tips and tricks is [Cédric Luthi](https://github.com/0xced) again, this time unearthing the private method `cache_print` as a way to get some visibility into [`NSCache`](http://nshipster.com/nscache/):

    extern void cache_print(void *cache);

    - (void) printCache:(NSCache *)cache {
        cache_print(*((void **)(__bridge void *)cache + 3));
    }

This code sample has only been tested on iOS, and should only be used for debugging (i.e. take this out before submitting to Apple!).

---

Thanks again to everyone for their submissions this time around. We'll definitely be doing this again, so feel free to send your favorite piece of Objective-C trivia, framework arcana, hidden Xcode feature, or anything else you think is cool to [@NSHipster](https://twitter.com/nshipster)!

And thank you, dear reader, for your support of NSHipster over these last wonderful months. We have a lot of insanely great things planned for NSHipster in 2013, and we look forward to being able to share it all with all of you.


