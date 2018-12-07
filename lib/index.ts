/**
 * Type of the check function when running acls.
 */
type CheckFn = (params: any) => Promise<boolean>;

/**
 * Types of both restrictions functions on definitions
 */
type RestrictFieldsByIdFn = (params: any, rest: FieldsByIdRestriction) => Promise<void>;
type RestrictFieldsFn = (params: any, rest: FieldsRestriction) => Promise<void>;

/**
 * Type of a single definition when configuring acls. 
 */
type Definition = {
    explain: string,
    from: string[],
    to: string[],
    check?: CheckFn,
    restrictFieldsById?: RestrictFieldsByIdFn,
    restrictFields?: RestrictFieldsFn
};

/**
 * Edge in the acl DAG
 */
class Edge {

    protected _from: string;
    protected _to: string;
    protected _explain: string;
    
    check: CheckFn;
    restrictFieldsById: RestrictFieldsByIdFn;
    restrictFields: RestrictFieldsFn;

    get from(): string {
        return this._from;
    }

    get to(): string {
        return this._to;
    }

    get explain(): string {
        return this._explain;
    }

    constructor(from: string, to: string, explain: string, check?: CheckFn, restrictFieldsById?: RestrictFieldsByIdFn, restrictFields?: RestrictFieldsFn) {
        this._from = from;
        this._to = to;
        this._explain = explain;
        this.check = check || (async params => true);
        this.restrictFieldsById = restrictFieldsById || (async (params, rest) => {});
        this.restrictFields = restrictFields || (async (params, rest) => { });;
    }
}



/**
 * This can be made much faster w/ less stress on the garbage collector.
 */
export class FieldsByIdRestriction {
    
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


export class FieldsRestriction {

    protected _fields: Set<string>;

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


/**
 * Acl checker class
 */
export default class Acl {

    static readonly Public: string = "public";

    /**
     * Contains all vertices, indexes by their from value.
     */
    protected _edges: Map<string, Edge[]>;

    constructor(definitions: Definition[]) {
        this._edges = new Map();

        for (let def of definitions) {
            def.from.forEach(from => {
                def.to.forEach(to => {
                    const edge = new Edge(from, to, def.explain, def.check, def.restrictFieldsById, def.restrictFields);
                    const edgeArr = this._edges.get(from);

                    if (edgeArr)
                        edgeArr.push(edge);
                    else
                        this._edges.set(from, [edge]);
                });
            });
        };
    }

    /**
     * Check that the current user is allowed to perform an action.
     *
     * @param to Permission that is being checked.
     * @param parameters Parameters provided to the ACL check (entityId, body, ...).
     * @param fieldsByIdRestr If provided, this object will be filled with list restrictions, but will cause slower execution.
     * @param from Permission to start from. Leave empty to start from the default "public" permission.
     */
    async check(to: string, parameters: any, fieldsByIdRestr: FieldsByIdRestriction | null = null, fieldsRestr: FieldsRestriction | null = null, from: string = 'public'): Promise<any> {
        if (from === to)
            return {}; // empty object == success
        
        const edges : Edge[] = this._edges.get(from) || [];
        const mergedParams : any  = {};
        let userIsAllowed : boolean = false;

        for (let edge of edges) {
            // Don't bother exploring routes that do not go to the destination.
            if (!this._canReach(edge.to, to))
                continue;
            
            // Push a new context so that only children can see what got pushed by this edge.
            // This is needed to make sure that the order we traverse the graph does not matter.
            const scopedParams = Object.create(parameters);
    
            // Check if we can transition to the next step.
            const checkPassed = await edge.check(scopedParams);
    
            // If this check passed, we check the next stages.
            if (checkPassed) {
                const childrenParams = await this.check(to, scopedParams, fieldsByIdRestr, fieldsRestr, edge.to);
                if (childrenParams) {
                    // Fill merged params from children and own parameters (so that we can 
                    // inject token, user, etc, on res.locals later on)
                    Object.assign(mergedParams, childrenParams);
                    Object.assign(mergedParams, scopedParams);

                    // We need to remember that the user passed the test, because checking if
                    // properties are defined in merged params is not enought.
                    userIsAllowed = true;

                    if (fieldsByIdRestr || fieldsRestr) {
                        Object.freeze(scopedParams); // Freeze params before using.

                        fieldsByIdRestr && await edge.restrictFieldsById(scopedParams, fieldsByIdRestr);
                        fieldsRestr && await edge.restrictFields(scopedParams, fieldsRestr);
                    }
                    else
                        // we only need to return a boolean: no need to test others paths since this one succeded
                        break;
                }
            }
        }

        return userIsAllowed ? mergedParams : null;
    }

    /**
     * Show the steps followed when traversing the permission graph.
     * 
     * @param to Permission that is being checked.
     * @param parameters Parameters provided to the ACL check (entityId, body, ...).
     * @param from Permission to start from. Leave empty to start from the default "public" permission.
     */
    async explain(to: string, parameters: any, from: string = "public"): Promise<any[]> {
        const result = [];
        const edges = this._edges.get(from) || [];

        for (let edge of edges) {
            if (!this._canReach(edge.to, to))
                continue;
            
            const scopedParams = Object.create(parameters);
            const checkPassed = await edge.check(scopedParams);
                
            result.push({
                explain: edge.explain,
                to: edge.to,
                check: checkPassed ? 'passed' : 'failed',
                params: scopedParams
            });

            if (edge.to !== to && checkPassed) {
                let children = await this.explain(to, scopedParams, edge.to);
                result.push(...children);
            }
        }

        return result;
    }

    /**
     * This can be cached forever with no time limits.
     * 
     * @param to Permission that is being checked.
     * @param from Permission to start from. Leave empty to start from the default "public" permission.
     */
    protected _canReach(from: string, to: string): boolean {
        if (from == to)
            return true;
        
        const edges = this._edges.get(from) || [];
        for (let edge of edges)
            if (this._canReach(edge.to, to))
                return true;

        return false;
    }
}

