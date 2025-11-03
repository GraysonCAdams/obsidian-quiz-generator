import { FilterQuery, FilterGroup, Filter, LogicalOperator } from "./filterTypes";

export class FilterQueryBuilder {
	private query: FilterQuery;

	constructor() {
		this.query = {
			groups: [],
			globalOperator: LogicalOperator.AND
		};
	}

	public setGlobalOperator(operator: LogicalOperator): FilterQueryBuilder {
		this.query.globalOperator = operator;
		return this;
	}

	public addGroup(filters: Filter[], operator: LogicalOperator): FilterQueryBuilder {
		this.query.groups.push({
			filters,
			operator
		});
		return this;
	}

	public build(): FilterQuery {
		return this.query;
	}

	public static fromQuery(query: FilterQuery): FilterQueryBuilder {
		const builder = new FilterQueryBuilder();
		builder.query = JSON.parse(JSON.stringify(query));
		return builder;
	}

	public static createEmpty(): FilterQuery {
		return {
			groups: [],
			globalOperator: LogicalOperator.AND
		};
	}

	public static isValid(query: FilterQuery): boolean {
		if (!query.groups || query.groups.length === 0) {
			return false;
		}

		for (const group of query.groups) {
			if (!group.filters || group.filters.length === 0) {
				return false;
			}
		}

		return true;
	}
}

