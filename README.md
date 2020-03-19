<p align="center">
  <img width="898" height="196" src="https://raw.githubusercontent.com/romain-gilliotte/you-shall-pass/master/assets/logo.png">
</p>

[![Build Status](https://travis-ci.org/romain-gilliotte/you-shall-pass.svg?branch=master)](https://travis-ci.org/romain-gilliotte/you-shall-pass)
[![Coverage Status](https://coveralls.io/repos/github/romain-gilliotte/you-shall-pass/badge.svg?branch=master)](https://coveralls.io/github/romain-gilliotte/you-shall-pass?branch=master)
[![npm](https://img.shields.io/npm/dt/you-shall-pass.svg)](https://www.npmjs.com/package/you-shall-pass)
[![NpmLicense](https://img.shields.io/npm/l/you-shall-pass.svg)](https://www.npmjs.com/package/you-shall-pass)
[![Maintainability](https://api.codeclimate.com/v1/badges/eb3f1cc07a3e01ff9a68/maintainability)](https://codeclimate.com/github/romain-gilliotte/you-shall-pass/maintainability)

You Shall Pass is yet another ACL module for Javascript applications designed to be used on ES6 or Typescript projects.

With its companion modules `express-you-shall-pass`, and `koa-you-shall-pass`, it aims to be able to replace both `passport` and `node-acl` on NodeJS APIs, but can also be used client side.

It was written while designing an API to manage a restaurant chain, which is consumed by clients with different and overlapping permissions: administration, digital signage, public smartphone apps, cash registers, ...

Like many others, it allows to check if a user has permissions to access resources and perform actions.

Unlike others:
- It does not need a storage backend to store permissions: they will come from your own persistence layer.
- Your permissions model will be easy to unit test.
- It can give your detailed information on why you got allowed or not to perform actions and access resources.
- It can be extended to load arbitrary restrictions associated with the permissions.
  - Permissions are not only either "yes" or "no". You can say "yes but only for ..." without creating many different roles.
  - It comes with two examples that allow to restrict models on collections, and fields on models.
  - You can teach it to alter your database queries to enforce permissions on lists with your SQL database.

As this module is security related:
- No production dependencies: feel free to audit the code and pin a version in your `package.json`.
- Dev-dependencies are limited to compilation and test tools.
- It is strictly typed with Typescript.
- It is fully unit tested.

# How does it works

With `you-shall-pass`, there are no roles and resources, all of your permissions are defined in a single "Permission Graph".

For instance for a blog API, the graph should look like this:

```
                                    +-----------+
                                    | is_anyone |
                                    +-----+-----+
                                          |
                                 If token |
     If author flag              is valid |            If moderator flag
     is set in the database               v            is set in the database
     +-----------+               +--------+---------+           +--------------+
     | is_author +<--------------+ is_authenticated +---------->+ is_moderator |
     +-----+-----+               +--------+---------+           +-------+------+
           |                              |                             |
           |                    If author |                             |
    Always |                    of the    |             Always          |
           |                    article   |   +-------------------------+
           v                              v   v                         v
+----------+---------+           +--------+---+-----+        +----------+---------+
| can_create_article |           | can_edit_article |        | can_delete_article |
+--------------------+           +------------------+        +--------------------+
```

# Usage

## The permission graph

Todo: write documentation

```javascript
const acl = new Acl(
    // Default permission
    'is_anyone',

    // Permission graph edges
    [
        {
            explain: "User carries a basic authentication token",
            from: 'is_anyone',
            to: 'is_authenticated',
            check: async ctx => {
                // Decode basic auth token.
                const [username, password] =
                    Buffer.from(ctx.token.split(' '), 'base64').toString().split(/:/);

                // Load user **into context**.
                // It will be available for all other check functions.
                ctx.user = await getUser(username);

                // true if allowed, false otherwise
                return ctx.user && bcrypt.verify(password, ctx.user.password);
            }
        },
        {
            explain: "User is a moderator",
            from: 'is_authenticated',
            to: 'is_moderator',
            check: async ctx => ctx.user.isModerator
        },
        {
            explain: 'Moderators can edit and delete all articles'
            from: 'is_moderator',
            to: ['can_edit_article', 'can_delete_article'],
        },
        {
            explain: "Authors can edit their own articles",
            from: 'is_authenticated',
            to: 'can_edit_article',
            check: async ctx => ctx.article.createdBy == ctx.user.email
        },
        [...]
    ]
);
```

## Checking permissions

Todo: write documentation

```javascript
// Can we reach the 'can_edit_article' permission **for this article and authentication token**
const result = await acl.check('can_edit_article', {
    token: 'Basic ZWxsaW90QGUtY29ycC5jb206YW5hcmNoeV9mdHc=',
    article: {id: 1, text: "I ❤ Javascript", createdBy: 'elliot@e-corp.com'}
});

if (result !== null) {
    // User is allowed to edit the article (result contains the current user because it was
    // loaded during the checks).
    assert.isNotNull(result.user);
}
else {
    // User does not have the 'can_edit_article' permission in this context.
}
```


## Customizing "Permission denied" messages

A user can be allowed to perform an action because of many reasons.
In the previous example, the permission to edit a given article can be reached either by the article author or by any moderator.

The same happens when a user is denied a permission: if a user is not allowed to edit a particular article, it is both because he is not a moderator, and because he is not the article's author.

By providing all nodes in the permission graph that were checked for a particular query, and the result of each check, the `.explain()` method provides insight about why a permission was granted or denied.

```javascript
// Ask `you-shall-pass` details about last example.
const explanation = await acl.explain('can_edit_article', {
    token: 'Basic ZWxsaW90QGUtY29ycC5jb206YW5hcmNoeV9mdHc=',
    article: {id: 1, text: "I ❤ anarchy", createdBy: 'elliot@e-corp.com'}
});

// We can check why we were allowed to edit the article in the previous example.
explanation
    .filter(e => e.to == 'can_edit_article' && e.checkPassed)
    .map(e => e.explain);
> ['Authenticated users can edit their own article']

// We can also check paths that the acl checker tried, but which failed to reach the requested permission.
explanation
    .filter(e => !e.checkPassed)
    .map(e => e.explain);
> ['User is a moderator']
```

## Using restrictions

Todo: write documentation

## Code structure

When dealing with complex permission graphs, if can quickly become inconvenient to handle the list of edges in a single file.

Todo: write documentation


# To do
- [ ] Have meaningful errors when data is missing in the parameters (ie: when forgetting parameters, or attaching permissions to wrong nodes).
- [ ] Write proper documentation.
- [ ] Cache the paths between permissions.
- [ ] More tests with restrictions examples.
- [ ] Tests with explain feature.
- [ ] Express and Koa middlewares, on others repos.
- [ ] Set-up greenkeeper to keep dev dependencies up to date.
