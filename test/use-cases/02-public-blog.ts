import { Acl } from "../../lib";
import { assert } from "chai";

/**
 * Example of the permission graph of E-Corp's public tech blog.
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
            return { email: 'elliot@e-corp.com', password: "anarchy_ftw", isModerator: true, isAuthor: true };

        case 'phillip@e-corp.com':
            return { email: 'phillip@e-corp.com', password: "power_ftw", isModerator: false, isAuthor: true };

        case 'angela@e-corp.com':
            return { email: 'angela@e-corp.com', password: "password", isModerator: false, isAuthor: false };

        default:
            throw 'Account not found';
    }
}

/**
 * Possible tokens to authenticate against the blog API.
 */
const TOKENS: {[email: string]: {[tokenType: string]: string}}= {
    'elliot@e-corp.com': {
        basic: 'Basic ZWxsaW90QGUtY29ycC5jb206YW5hcmNoeV9mdHc=',
        // jwt: 'Bearer '
    },
    'phillip@e-corp.com': {
        basic: 'Basic cGhpbGxpcEBlLWNvcnAuY29tOnBvd2VyX2Z0dw==',
        // jwt: 'Bearer '
    },
    'angela@e-corp.com': {
        basic: 'Basic YW5nZWxhQGUtY29ycC5jb206cGFzc3dvcmQ=',
        // jwt: 'Bearer '
    },
};


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

const acl = new Acl(Roles.Public, [
    {
        from: Roles.Public,
        to: Roles.Authenticated,
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
        from: Roles.Public,
        to: Roles.Authenticated,
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
            catch (e) {
                return false;
            }
        }
    },
    {
        from: Roles.Authenticated,
        to: Roles.Author,
        explain: "User is an author on this blog",
        check: async params => params.user.isAuthor
    },
    {
        from: Roles.Authenticated,
        to: Roles.Moderator,
        explain: "User is a moderator",
        check: async params => params.user.isModerator
    },
    {
        from: Roles.Author,
        to: Roles.canPostArticle,
        explain: 'Authors can post articles'
    },
    {
        from: Roles.Moderator,
        to: [Roles.canEditArticle, Roles.canEditComment],
        explain: 'Moderators can edit all articles and comments'
    },
    {
        from: Roles.Author,
        to: Roles.canEditArticle,
        explain: "Authors can edit their own articles",
        check: async params => params.article.createdBy == params.user.email
    },
    {
        from: Roles.Authenticated,
        to: Roles.canPostComment,
        explain: "Authenticated users can post new comments"
    },
    {
        from: Roles.Authenticated,
        to: Roles.canEditComment,
        explain: "Authenticated users can edit their own comment",
        check: async params => params.comment.createdBy == params.user.email
    }
]);


describe('Acl on a blog', () => {

    describe('should work for authentication', () => {

        it('Everyone can authenticate using either tokens', async () => {
            for (let email in TOKENS) {
                for (let tokenType in TOKENS[email]) {
                    const result = await acl.check(Roles.Authenticated, {
                        token: TOKENS[email][tokenType]
                    });

                    assert.isNotNull(result);
                    assert.equal(result!.user.email, email);
                }
            }
        });

    });

    describe('should work for posting articles', () => {

        it('Elliot can post articles', async () => {
            const result = await acl.check(Roles.canPostArticle, {
                token: TOKENS["elliot@e-corp.com"].basic
            });

            assert.isNotNull(result);
            assert.equal(result!.user.email, 'elliot@e-corp.com');
        });

        it('Angela cannot post articles', async () => {
            const result = await acl.check(Roles.canPostArticle, {
                token: TOKENS["angela@e-corp.com"].basic
            });

            assert.isNull(result);
        });

        it('Elliot can edit his own articles.', async () => {
            const result = await acl.check(Roles.canEditArticle, {
                token: TOKENS["elliot@e-corp.com"].basic,
                article: {
                    createdBy: 'elliot@e-corp.com'
                }
            });

            assert.isNotNull(result);
            assert.equal(result!.user.email, "elliot@e-corp.com");
        });

        it('Elliot can edit phillip\'s articles', async () => {
            const result = await acl.check(Roles.canEditArticle, {
                token: TOKENS["elliot@e-corp.com"].basic,
                article: {
                    createdBy: 'phillip@e-corp.com'
                }
            });

            assert.isNotNull(result);
            assert.equal(result!.user.email, "elliot@e-corp.com");
        })

        it('Phillip can edit his own articles.', async () => {
            const result = await acl.check(Roles.canEditArticle, {
                token: TOKENS["phillip@e-corp.com"].basic,
                article: {
                    createdBy: 'phillip@e-corp.com'
                }
            });

            assert.isNotNull(result);
            assert.equal(result!.user.email, "phillip@e-corp.com");
        });

        it('Phillip cannot edit Elliot\'s articles', async () => {
            const result = await acl.check(Roles.canEditArticle, {
                token: TOKENS["phillip@e-corp.com"].basic,
                article: {
                    createdBy: 'elliot@e-corp.com'
                }
            });

            assert.isNull(result);
        });

        it('Angela cannot edit her own articles', async () => {
            const result = await acl.check(Roles.canEditArticle, {
                token: TOKENS["angela@e-corp.com"].basic,
                article: {
                    createdBy: 'angela@e-corp.com'
                }
            });

            assert.isNull(result);
        });

        it('Angela cannot edit other people articles', async () => {
            const result = await acl.check(Roles.canEditArticle, {
                token: TOKENS["angela@e-corp.com"].basic,
                article: {
                    createdBy: 'anyone@e-corp.com'
                }
            });

            assert.isNull(result);
        });

    });

    describe('should work for posting comments', () => {

        it('Angela can post comments', async () => {
            const result = await acl.check(Roles.canPostComment, {
                token: TOKENS["angela@e-corp.com"].basic
            });

            assert.isNotNull(result);
            assert.equal(result!.user.email, "angela@e-corp.com");
        });

        it('Angela cannot edit Elliot\'s comments', async () => {
            const result = await acl.check(Roles.canEditComment, {
                token: TOKENS["angela@e-corp.com"].basic,
                comment: {
                    createdBy: "elliot@e-corp.com"
                }
            });

            assert.isNull(result);
        });

        it('Elliot can edit Angela\'s comments', async () => {
            const result = await acl.check(Roles.canEditComment, {
                token: TOKENS["elliot@e-corp.com"].basic,
                comment: {
                    createdBy: "angela@e-corp.com"
                }
            });

            assert.isNotNull(result);
            assert.equal(result!.user.email, "elliot@e-corp.com");
        });

    });

});
