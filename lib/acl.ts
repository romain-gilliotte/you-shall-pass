
/** Type of parameters (== object literal) */
type Params = {[key: string]: any};

/** Type of the check function when running acls. */
type CheckFn = (params: Params) => Promise<boolean>;

/** Types of both restrictions functions on definitions. */
type RestrictFn = (params: Params, restriction: any) => Promise<void>;
type RestrictFns = {[key: string]: RestrictFn};

/** Types of restriction objects. */
type Restriction = any;
type RestrictionHash = {[key: string]: Restriction};

/** Type of public function results */
export type CheckResult = Params;

export type ExplainResult = {
    to: string,
    explain: string,
    checkPassed: boolean,
    params: Params
};

/** Type of a single definition when configuring acls. */
export type Definition = {
    explain: string,
    from: string[] | string,
    to: string[] | string,
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

    async fillRestrictions(restrictions: RestrictionHash, params: Params): Promise<void> {
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

    /**
     * Contains the default role
     */
    protected _defaultRole: string;

    constructor(defaultRole: string, definitions: Definition[]) {
        this._defaultRole = defaultRole;
        this._edges = new Map();

        for (let def of definitions) {
            if (!Array.isArray(def.from))
                def.from = [def.from];

            if (!Array.isArray(def.to))
                def.to = [def.to];

            for (let from of def.from) {
                for (let to of def.to) {
                    const edge = new Edge(from, to, def.explain, def.check, def.restrict);
                    const edgeArr = this._edges.get(from);

                    if (edgeArr)
                        edgeArr.push(edge);
                    else
                        this._edges.set(from, [edge]);
                }
            }
        }
    }

    /**
     * Check that the current user is allowed to perform an action.
     *
     * @param permission Permission that is being checked.
     * @param params Parameters provided to the ACL check (entityId, body, ...).
     * @param restrictions If provided, allows to load restrictions while traversing the permission graph.
     */
    async check(permission: string, params: Params, restrictions: RestrictionHash = {}): Promise<CheckResult | null> {
        return this._check(this._defaultRole, permission, params, restrictions);
    }

    protected async _check(from: string, to: string, params: Params, restrictions: RestrictionHash = {}): Promise<CheckResult|null> {
        // Succeed when we reach the target
        if (from === to)
            return params;

        // Explore all paths that go towards the target.
        const edges: Edge[] = (this._edges.get(from) || []).filter(edge => this._canReach(edge.to, to));
        const checks = edges.map(edge => this._checkChildren(edge, to, params, restrictions));
        const results = await Promise.all(checks);

        // Merge positive results if it worked, fail otherwise.
        const positiveResults = results.filter(r => !!r);
        return positiveResults.length ? positiveResults.reduce((m, e) => Object.assign(m, e), {}) : null;
    }

    protected async _checkChildren(edge: Edge, to: string, params: Params, restrictions: RestrictionHash): Promise<CheckResult|null> {
        // Push a new context so that only children can see what got pushed by this edge.
        // This is needed to make sure that the order we traverse the graph does not matter.
        const scopedParams = Object.create(params);

        // If we fail going to the next step, skip this path.
        const checkPassed = await edge.check(scopedParams);
        if (!checkPassed)
            return null;

        // If we fail during recursion, also skip path.
        const childrenParams = await this._check(edge.to, to, scopedParams, restrictions);
        if (!childrenParams)
            return null;

        edge.fillRestrictions(restrictions, scopedParams);

        // Merge children params with our own, (so that we can return token, user, etc, to the caller).
        return Object.assign({}, scopedParams, childrenParams);
    }

    /**
     * Show the steps followed when traversing the permission graph.
     *
     * @param permission Permission that is being checked.
     * @param params Parameters provided to the ACL check (entityId, body, ...).
     */
    async explain(permission: string, params: Params): Promise<ExplainResult[]> {
        return this._explain(this._defaultRole, permission, params);
    }

    protected async _explain(from: string, to: string, params: Params): Promise<ExplainResult[]> {
        const result: ExplainResult[] = [];
        const edges: Edge[] = this._edges.get(from) || [];

        for (let edge of edges) {
            if (!this._canReach(edge.to, to))
                continue;

            const scopedParams: Params = Object.create(params);
            const checkPassed: boolean = await edge.check(scopedParams);

            result.push({
                explain: edge.explain,
                to: edge.to,
                checkPassed: checkPassed,
                params: scopedParams
            });

            if (edge.to !== to && checkPassed) {
                let children = await this._explain(edge.to, to, scopedParams);
                result.push(...children);
            }
        }

        return result;
    }

    /**
     * This can be cached forever with no time limits.
     *
     * @param from Permission to start from.
     * @param to Permission that is being checked.
     */
    protected _canReach(from: string, to: string): boolean {
        if (from == to)
            return true;

        const edges: Edge[] = this._edges.get(from) || [];
        for (let edge of edges)
            if (this._canReach(edge.to, to))
                return true;

        return false;
    }
}

