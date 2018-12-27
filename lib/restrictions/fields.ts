
export default class FieldsRestriction {

    protected _fields: Set<string>;

    get fields() {
        return this._fields;
    }

    constructor() {
        this._fields = new Set();
    }

    fieldIsAllowed(field: string): boolean {
        return this._fields.has(field);
    }

    allow(fields: string[]): void {
        for (let field of fields)
            this._fields.add(field);
    }
}

