import { assert } from "chai";
import { FieldsByIdRestriction } from "../../lib";

describe('fields by id restrictions', () => {

    describe("should work when using only specified ids.", () => {

        let fbi = new FieldsByIdRestriction();
        fbi.allowSome([1, 2, 3], ['id', 'name']);
        fbi.allowSome([2, 4], ['name', 'description']);

        it('should not allow all ids', () => {
            assert.isTrue(fbi.hasIdRestriction);
        });

        it('should give id list when requested', () => {
            assert.deepEqual(fbi.getAllowedIds(), [1, 2, 3, 4]);
        })

        it('should allow explicitely authorized fields', () => {
            assert.isTrue(fbi.fieldIsAllowed(1, 'name'));
            assert.isTrue(fbi.fieldIsAllowed(2, 'name'));
        })

        it('should not allow fields on wrong id', () => {
            assert.isFalse(fbi.fieldIsAllowed(1, 'description'));
            assert.isFalse(fbi.fieldIsAllowed(4, 'id'));
            assert.isFalse(fbi.fieldIsAllowed(5, 'id'));
        });

        it('should not allow wrong field names', () => {
            assert.isFalse(fbi.fieldIsAllowed(2, 'unknown_field'));
        });

    });

    describe("should work when using only unspecified ids.", () => {
        let fbi = new FieldsByIdRestriction();
        fbi.allowAll(['id', 'name']);
        fbi.allowAll(['name', 'description']);

        it('should allow all ids', () => {
            assert.isFalse(fbi.hasIdRestriction);
        });

        it('should throw when asking for ids', () => {
            assert.throws(() => fbi.getAllowedIds())
        })

        it('should allow explicitely authorized fields', () => {
            assert.isTrue(fbi.fieldIsAllowed(1, 'name'));
            assert.isTrue(fbi.fieldIsAllowed(2, 'id'));
        })

        it('should not allow wrong field names', () => {
            assert.isFalse(fbi.fieldIsAllowed(2, 'unknown_field'));
        });

    });

});


