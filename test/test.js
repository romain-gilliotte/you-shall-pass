'use strict';

var assert = require('chai').assert;
var module = require('../dist/index.js');

const acl = new module.default([
    {
        from: [module.default.Public],
        to: ['has_secret_key'],
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

