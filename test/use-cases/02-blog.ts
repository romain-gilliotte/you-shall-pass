import { Acl } from "../../lib";
import { assert } from "chai";

/**
 * Example of the permission graph of E-Corp's tech blog.
 * 
 * Phillip and Elliot are both authors at this blog, so they can write new posts, and edit their own posts.
 * Elliot is also a moderator, so he can also edit other's people posts and comments.
 * Angela is neither, but she can still post comments.
 * Everyone can read the blog, there is no need to authenticate for that.
 */

/**
 * Mock for fetching the user from database.
 */
async function getUser(username: string): Promise<any> {
    switch (username) {
        case 'elliot@e-corp.com':
            return { email: 'elliot@e-corp.com', password: "anarchy_ftw", isModerator: true, isAuthor: true};

        case 'phillip@e-corp.com':
            return { email: 'phillip@e-corp', password: "power_ftw", isModerator: false, isAuthor: true};

        case 'angela@e-corp.com':
            return { email: 'angela@e-corp', password: "password", isModerator: false, isAuthor: false };

        default:
            throw 'Account not found';
    }
}

/**
 * Possible tokens to authenticate against the blog API.
 */
const TOKENS = Object.freeze({
    'elliot@e-corp.com': Object.freeze({
        basic: 'Basic ZWxsaW90QGUtY29ycC5jb206YW5hcmNoeV9mdHc=',
        jwt: 'Bearer '
    }),
    'phillip@e-corp.com': Object.freeze({
        basic: 'Basic cGhpbGxpcEBlLWNvcnAuY29tOnBvd2VyX2Z0dw==',
        jwt: 'Bearer '
    }),
    'angela@e-corp.com': Object.freeze({
        basic: 'Basic YW5nZWxhQGUtY29ycC5jb206cGFzc3dvcmQ=',
        jwt: 'Bearer '
    }),
});


enum Roles {
    Public = 'public',
    Authenticated = 'authenticated',

    Author = 'author',
    Moderator = 'moderator',

    canPostArticle = 'can_post_article',
    canEditArticle = 'can_edit_article',

    canPostComment = 'can_post_comment',
    canEditComment = 'can_edit_comment'
}

const acl = new Acl([
    {
        from: [Roles.Public],
        to: [Roles.Authenticated],
        explain: "User carries a basic authentication token",
        check: async params => {
            try {
                // Decode basic auth token.
                const [_, token] = params.token.split(' ');
                const [username, password] = Buffer.from(token, 'base64').toString().split(/:/);
                
                // Load user from database into parameters for other check functions
                params.user = await getUser(username);
                
                // Check password, which is stored in plain text on the user.
                // Don't do this in real-life!
                return params.user.password === password;
            }
            catch (e) {
                return false;
            }
        }
    },
    {
        from: [Roles.Public],
        to: [Roles.Authenticated],
        explain: "User carries a JWT token",
        check: async params => {
            try {
                // Decode jwt token without checking signature, don't do this in real life!
                const [b64header, b64payload, b64signature] = params.token.split('.');
                const payload = JSON.parse(Buffer.from(b64payload, 'base64').toString());

                // Load user from database into parameters for other check functions
                params.user = await getUser(payload.sub);

                // No need to check the password, the token was signed.
                return true;
            }
            catch(e) {
                return false;
            }
        }
    },
    {
        from: [Roles.Authenticated],
        to: [Roles.Author],
        explain: "User is an author on this blog",
        check: async params => {
            // use the user loaded earlier to check for admin status
            return params.user.isAuthor
        }
    },
    {
        from: [Roles.Authenticated],
        to: [Roles.Moderator],
        explain: "User is a moderator",
        check: async params => {
            // use the user loaded earlier to check for admin status
            return params.user.isModerator
        }
    },
    {
        from: [Roles.Author],
        to: [Roles.canPostArticle],
        explain: 'Authors can post articles'
    },
    {
        from: [Roles.Moderator],
        to: [Roles.canEditArticle, Roles.canEditComment],
        explain: 'Moderators can edit all articles and comments'
    },
    {
        from: [Roles.Author],
        to: [Roles.canEditArticle],
        explain: "Authors can only edit their own posts",
        check: async params => {
            return params.article.createdBy == params.user.email;
        }
    },
    {
        from: [Roles.Authenticated],
        to: [Roles.canPostComment],
        explain: "Authenticated users can post new comments"
    },
    {
        from: [Roles.Authenticated],
        to: [Roles.canEditComment],
        explain: "Authenticated users can only edit their own comment",
        check: async params => {
            return params.comment.createdBy == params.user.email;
        }
    }
]);


describe('Acl checks', () => {

    describe('should work on a blog', () => {

        it('Everyone can authenticate using either tokens', async () => {
            assert.isNotNull(await acl.check(Roles.Public, Roles.Authenticated, { token: TOKENS["angela@e-corp.com"].basic }));
            assert.isNotNull(await acl.check(Roles.Public, Roles.Authenticated, { token: TOKENS["elliot@e-corp.com"].basic }));
            assert.isNotNull(await acl.check(Roles.Public, Roles.Authenticated, { token: TOKENS["phillip@e-corp.com"].basic }));

            // assert.isNotNull(await acl.check(Roles.Public, Roles.Authenticated, { token: TOKENS["angela@e-corp.com"].jwt }));
            // assert.isNotNull(await acl.check(Roles.Public, Roles.Authenticated, { token: TOKENS["elliot@e-corp.com"].jwt }));
            // assert.isNotNull(await acl.check(Roles.Public, Roles.Authenticated, { token: TOKENS["phillip@e-corp.com"].jwt }));
        });

        it('Elliot and Phillip can post articles', async () => {
            assert.isNotNull(await acl.check(Roles.Public, Roles.canPostArticle, { token: TOKENS["elliot@e-corp.com"].basic }));
            assert.isNotNull(await acl.check(Roles.Public, Roles.canPostArticle, { token: TOKENS["phillip@e-corp.com"].basic }));
        });

        it('Angela cannot post articles', async () => {
            assert.isNull(await acl.check(Roles.Public, Roles.canPostArticle, { token: TOKENS["angela@e-corp.com"].basic }));
        });

        it('Elliot can edit everyone\'s posts', async () => {

        });

        it('Everyone can post comments', async () => {
            assert.isNotNull(await acl.check(Roles.Public, Roles.canPostComment, { token: TOKENS["angela@e-corp.com"].basic }));
            assert.isNotNull(await acl.check(Roles.Public, Roles.canPostComment, { token: TOKENS["elliot@e-corp.com"].basic }));
            assert.isNotNull(await acl.check(Roles.Public, Roles.canPostComment, { token: TOKENS["phillip@e-corp.com"].basic }));
        });

    });

});
