

/**
 * This can be made much faster w/ less stress on the garbage collector.
 */
export default class FieldsByIdRestriction {

    protected _byId: Map<number, Set<string>>;
    protected _others: Set<string>;

    get hasIdRestriction() {
        return this._others.size == 0;
    }

    constructor() {
        // when we begin, nothing is allowed.
        this._byId = new Map();
        this._others = new Set();
    }

    getAllowedIds(): number[] {
        if (!this.hasIdRestriction)
            throw new Error('no id restriction');

        return Array.from(this._byId.keys());
    }

    fieldIsAllowed(id: number, field: string): boolean {
        if (this._others.has(field))
            return true;

        const allowedFields = this._byId.get(id);
        if (allowedFields)
            return allowedFields.has(field);

        return false;
    }

    allowSome(ids: number[], fields: string[]): void {
        for (let id of ids) {
            const allowedFields = this._byId.get(id);
            if (allowedFields)
                for (let field of fields)
                    allowedFields.add(field);
            else
                this._byId.set(id, new Set(fields));
        }
    }

    allowAll(fields: string[]): void {
        for (let field of fields)
            this._others.add(field);
    }
}
