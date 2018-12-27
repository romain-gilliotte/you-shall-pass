import { assert } from "chai";
import { FieldsRestriction } from "../../lib";

describe('Restrictions', () => {

    describe('Fields should work', () => {

        const fr = new FieldsRestriction();
        fr.allow(['id', 'name']);
        fr.allow(['name', 'description']);

        it('should allow explicitely authorized fields', () => {
            assert.isTrue(fr.fieldIsAllowed('name'));
            assert.isTrue(fr.fieldIsAllowed('id'));
        })

        it('should not allow wrong field names', () => {
            assert.isFalse(fr.fieldIsAllowed('unknown_field'));
        });
    });
});

