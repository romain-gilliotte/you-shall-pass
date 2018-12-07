
import {assert} from "chai";
import Acl from "../lib/index";

const acl = new Acl([
    {
        from: [Acl.Public],
        to: ['has_secret_key'],
        explain: "coucou",
        check: async (params) => params.key == 'super_secret'
    }
])

describe('basic test', () => {

    it('should deny access', () => {
        assert.isNotNull(acl.check('has_secret_key', { key: 'wrong_super_secret' }));
    });

    it('should allow access', () => {
        assert.isNotNull(acl.check('has_secret_key', {key: 'super_secret'}));
    });

});

