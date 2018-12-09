import { assert } from "chai";
import { Acl } from "../../lib/index";

/**
 * Mock for user retrieval from database.
 * - User 1 is an administrator
 * - User 2 is a normal user
 * - All other users fails
 * 
 * @param id Which user should be retrieved.
 */
async function getUser(id: number) {
    switch (id) {
        case 1:
            return { id: 1, isAdmin: true };

        case 2:
            return { id: 2, isAdmin: false };

        default:
            throw "User not found";
    }
}

enum Roles {
    Public = 'public',
    HasSecretKey = 'has_secret_key',
    IsAdmin = 'is_admin'
}

const acl = new Acl([
    {
        from: [Roles.Public],
        to: [Roles.HasSecretKey],
        explain: "Super secret was passed",
        check: async (params) => params.key == 'super_secret'
    },
    {
        from: [Roles.HasSecretKey],
        to: [Roles.IsAdmin],
        explain: "User is an administrator",
        check: async (params) => {
            try {
                params.user = await getUser(params.userId);
                return params.user.isAdmin;
            }
            catch (e) {
                params.user = null;
                return false;
            }
        }
    }
]);


describe('Acl checks', () => {

    describe('should work on a simple case', () => {

        it('should deny access to HasSecretKey if secret key is wrong or not provided', async () => {
            assert.isNull(await acl.check(Roles.Public, Roles.HasSecretKey, {}));
            assert.isNull(await acl.check(Roles.Public, Roles.HasSecretKey, { key: 'wrong_super_secret' }));
        });

        it('should deny access to isAdmin if secret key is wrong or not provided', async () => {
            assert.isNull(await acl.check(Roles.Public, Roles.IsAdmin, {}));
            assert.isNull(await acl.check(Roles.Public, Roles.IsAdmin, { key: 'wrong_super_secret', userId: 1 }));
        });

        it('should deny access to isAdmin if secret key right but userid is wrong', async () => {
            assert.isNull(await acl.check(Roles.Public, Roles.IsAdmin, { key: 'super_secret', userId: 2 }));
            assert.isNull(await acl.check(Roles.Public, Roles.IsAdmin, { key: 'super_secret', userId: 3 }));
        });

        it('should deny access to unknown roles', async () => {
            assert.isNull(await acl.check(Roles.Public, 'unknown_role', {}));
            assert.isNull(await acl.check(Roles.Public, 'unknown_role', { key: 'super_secret', userId: 1 }));
        });

        it('should allow access to the public role', async () => {
            assert.isNotNull(await acl.check(Roles.Public, Roles.Public, {}));
        });

        it('should allow access to the HasSecret role if the key is provided', async () => {
            assert.isNotNull(await acl.check(Roles.Public, Roles.HasSecretKey, { key: 'super_secret' }));
        });

        it('should allow access to the Admin role if the key and userId are provided', async () => {
            assert.isNotNull(await acl.check(Roles.Public, Roles.IsAdmin, { key: 'super_secret', userId: 1 }));
        });
    });
});
