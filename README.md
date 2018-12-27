<p align="center">
  <img width="898" height="196" src="https://raw.githubusercontent.com/romain-gilliotte/you-shall-pass/master/assets/logo.png">
</p>

[![Build Status](https://travis-ci.org/romain-gilliotte/you-shall-pass.svg?branch=master)](https://travis-ci.org/romain-gilliotte/you-shall-pass)
[![Coverage Status](https://coveralls.io/repos/github/romain-gilliotte/you-shall-pass/badge.svg?branch=master)](https://coveralls.io/github/romain-gilliotte/you-shall-pass?branch=master)
[![npm](https://img.shields.io/npm/dt/you-shall-pass.svg)](https://www.npmjs.com/package/you-shall-pass)
[![NpmLicense](https://img.shields.io/npm/l/you-shall-pass.svg)](https://www.npmjs.com/package/you-shall-pass)
[![Maintainability](https://api.codeclimate.com/v1/badges/eb3f1cc07a3e01ff9a68/maintainability)](https://codeclimate.com/github/romain-gilliotte/you-shall-pass/maintainability)

You Shall Pass is yet another ACL module for Javascript applications designed to be used on ES6 or Typescript projects.

Like many others, it allows to check if a user has permissions to access resources and perform actions.

Unlike others:
- It does not need a storage backend to store permissions: they will come from your own persistence layer.
- It can give your detailed information on why you got allowed or not to perform actions and access ressources.
- It can be extended to load arbitrary restrictions associated with the permissions.
  - Permissions not only either "yes" or "no":  "yes but..."
  - It comes with two examples that allow to restrict models on collections, and fields on models.
  - You can teach it to alter your database queries to enforce permissions on lists with your SQL database.

As this module is security related:
- It is strictly typed with Typescript.
- It has no production dependencies. Dev dependencies are limited to compilation and test tools.
- It is fully unit tested.

# Quick start

When using `you-shall-pass`, the first step is to design your permission graph.

```javascript
// Create permission graph
const acl = new Acl([
    {
        from: ['Public'],
        to: ['Authenticated'],
        explain: "User carries a basic authentication token",
        check: async params => {
            // Decode basic auth token.
            const [username, password] =
                Buffer.from(params.token.split(' '), 'base64').toString().split(/:/);

            // Load user from database into parameters for other check functions
            params.user = await getUser(username);

            // Check password, don't do it like this in real-life!
            return params.user && params.user.password === password;
        }
    },
    {
        from: ['Authenticated'],
        to: ['Author'],
        explain: "User is an author on this blog",
        check: async params => params.user.isAuthor
    },
    {
        from: ['Authenticated'],
        to: ['Moderator'],
        explain: "User is a moderator",
        check: async params => params.user.isModerator
    },
    {
        from: ['Moderator'],
        to: ['ArticleEditor'],
        explain: 'Moderators can edit all articles'
    },
    {
        from: ['Author'],
        to: ['ArticleEditor'],
        explain: "Authors can edit their own articles",
        check: async params => params.article.createdBy == params.user.email
    },
    [...]
]);
```

Then you can check roles against given parameters.

```javascript
// Can we reach the 'ArticleEditor' role from the 'Public' role with those params?
const result = await acl.check('Public', 'ArticleEditor', {
    token: 'Basic ZWxsaW90QGUtY29ycC5jb206YW5hcmNoeV9mdHc=',
    article: {id: 1, text: "I ❤ Javascript", createdBy: 'elliot@e-corp.com'}
});

if (result) {
    // User is allowed to edit the article (result contains the current user because it was
    // loaded during the checks).
    assert.isNotNull(result.user);
}
else {
    // User does not have the ArticleEditor role **for this article**.
}
```


# Explaining permissions

A user can be allowed to perform an action because of many reasons.
In the previous example, the role to edit a given article can be reached either by the article author or by any moderator.

If needed, the `explain()` method provides insight about what happened internally when granting or denying a permission: it provides a summary of:
- All nodes in the role graph that were checked for this request.
- For each one
  - If the check was successful
  - The parameters that were added

```javascript
// Ask `you-shall-pass` details about last example.
const explanation = await acl.explain('Public', 'ArticleEditor', {
    token: 'Basic ZWxsaW90QGUtY29ycC5jb206YW5hcmNoeV9mdHc=',
    article: {id: 1, text: "I ❤ Javascript", createdBy: 'elliot@e-corp.com'}
});

// We can check why we were allowed to edit the article in the previous example.
explanation
    .filter(e => e.to == 'ArticleEditor' && e.check == 'passed')
    .map(e => e.explain);
> ['Authenticated users can edit their own article']

// We can also check paths that the acl checker tried, but which failed to reach the requested role.
explanation
    .filter(e => e.check == 'failed')
    .map(e => e.explain);
> ['User is a moderator']
```

