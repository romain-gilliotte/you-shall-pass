import {assert} from "chai";
import {Acl} from "../lib/index";

const acl = new Acl([
    {
        from: ['public'],
        to: ['has_secret_key'],
        explain: "Super secret key must be passed",
        check: async (params) => params.key == 'super_secret'
    },
    {
        from: ['has_secret_key'],
        to: ['is_admin'],
        explain: "User is not an administrator",
        check: async (params) => {
            params.user = {id: 1, isAdmin: true};
            return true;
        }
    }
]);

describe('basic test', () => {

    it('should deny access', async () => {
        assert.isNull(await acl.check('public', 'has_secret_key', { key: 'wrong_super_secret' }));
        assert.isNull(await acl.check('public', 'has_secret_key', {}));
        assert.isNull(await acl.check('public', 'is_admin', {}));
        assert.isNull(await acl.check('public', 'unknown_role', {}));
    });

    it('should allow access', async () => {
        assert.isNotNull(await acl.check('public', 'has_secret_key', {key: 'super_secret'}));
    });

});

