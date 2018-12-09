import { Acl } from "../../lib";

/**
 * 
 */
enum Roles {
    Public = 'public',
    BasicAuthenticated = 'basic_authenticated',
    JwtAuthenticated = 'jwt_authenticated',
    Authenticated = 'authenticated',

    Reader = 'reader',
    Author = 'author',
    IsAdmin = 'admin',

    canPostArticle = 'can_post_article',
    canPostComment = 'can_post_comment'
}

const acl = new Acl([

]);
