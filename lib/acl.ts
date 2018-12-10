/**
 * Type of the check function when running acls.
 */
type CheckFn = (params: any) => Promise<boolean>;

/**
 * Types of both restrictions functions on definitions
 */
type RestrictFn = (params: any, restriction: any) => Promise<void>;
type RestrictFns = {[key: string]: RestrictFn};

/**
 * Types of restriction objects.
 */
type Restriction = any;
type RestrictionHash = {[key: string]: Restriction};


/**
 * Type of a single definition when configuring acls. 
 */
type Definition = {
    explain: string,
    from: string[],
    to: string[],
    check?: CheckFn,
    restrict?: RestrictFns
};

/**
 * Edge in the acl DAG
 */
class Edge {

    check: CheckFn;

    protected _from: string;
    protected _to: string;
    protected _explain: string;
    protected _restrictFns: RestrictFns;

    get from(): string {
        return this._from;
    }

    get to(): string {
        return this._to;
    }

    get explain(): string {
        return this._explain;
    }

    constructor(from: string, to: string, explain: string, check?: CheckFn, restrictFns?: RestrictFns) {
        this._from = from;
        this._to = to;
        this._explain = explain;
        this._restrictFns = restrictFns || {};
        this.check = check || (params => Promise.resolve(true));
    }

    async fillRestrictions(restrictions: RestrictionHash, params: any): Promise<void> {
        const frozenParams = Object.freeze(Object.create(params));
        
        for (let key in restrictions)
            if (this._restrictFns[key])
                await this._restrictFns[key](frozenParams, restrictions[key]);
    }
}


/**
 * Acl checker class
 */
export default class Acl {

    /**
     * Contains all vertices, indexes by their from value.
     */
    protected _edges: Map<string, Edge[]>;

    constructor(definitions: Definition[]) {
        this._edges = new Map();

        for (let def of definitions) {
            def.from.forEach(from => {
                def.to.forEach(to => {
                    const edge = new Edge(from, to, def.explain, def.check, def.restrict);
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
    async check(from: string, to: string, parameters: any, restrictions: RestrictionHash = {}): Promise<any> {
        // Succeed when we reach the target
        if (from === to)
            return parameters;

        // Explore all paths that go towards the target.        
        const edges: Edge[] = (this._edges.get(from) || []).filter(edge => this._canReach(edge.to, to));
        const checks = edges.map(edge => this._checkChildren(edge, to, parameters, restrictions));
        const results = await Promise.all(checks);

        // Merge positive results if it worked, fail otherwise.
        const positiveResults = results.filter(r => !!r);
        if (positiveResults.length)
            return positiveResults.reduce(Object.assign, {});
        else
            return null;
    }

    async _checkChildren(edge: Edge, to: string, parameters: any, restrictions: RestrictionHash) {
        // Push a new context so that only children can see what got pushed by this edge.
        // This is needed to make sure that the order we traverse the graph does not matter.
        const scopedParams = Object.create(parameters);

        // If we fail going to the next step, skip this path.
        const checkPassed = await edge.check(scopedParams);
        if (!checkPassed)
            return null;

        // If we fail during recursion, also skip path.
        const childrenParams = await this.check(edge.to, to, scopedParams, restrictions);
        if (!childrenParams)
            return null;

        if (restrictions)
            edge.fillRestrictions(restrictions, scopedParams)

        // Fill merged params from children and own parameters (so that we can 
        // inject token, user, etc, on res.locals later on)
        const mergedParams: any = {};
        Object.assign(mergedParams, childrenParams);
        Object.assign(mergedParams, scopedParams);
        return mergedParams;
    }

    /**
     * Show the steps followed when traversing the permission graph.
     * 
     * @param to Permission that is being checked.
     * @param parameters Parameters provided to the ACL check (entityId, body, ...).
     * @param from Permission to start from. Leave empty to start from the default "public" permission.
     */
    async explain(from: string, to: string, parameters: any): Promise<any[]> {
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
                let children = await this.explain(edge.to, to, scopedParams);
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

