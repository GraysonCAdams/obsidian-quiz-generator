export enum FilterType {
	TAG = "tag",
	FRONTMATTER = "frontmatter",
	FOLDER = "folder",
	DATE_RANGE = "date-range",
	TEXT_CONTENT = "text-content",
	FILE_NAME = "file-name"
}

export enum LogicalOperator {
	AND = "AND",
	OR = "OR"
}

export enum DateFilterType {
	MODIFIED = "modified",
	CREATED = "created"
}

export enum DateRangeType {
	LAST_N_DAYS = "last-n-days",
	CUSTOM = "custom",
	BEFORE = "before",
	AFTER = "after"
}

export enum TextSearchMode {
	CONTAINS = "contains",
	EXACT = "exact",
	REGEX = "regex"
}

export interface TagFilter {
	type: FilterType.TAG;
	tag: string;
	negate?: boolean;
}

export interface FrontmatterFilter {
	type: FilterType.FRONTMATTER;
	property: string;
	operator: "equals" | "contains" | "exists" | "not-exists";
	value?: string;
	negate?: boolean;
}

export interface FolderFilter {
	type: FilterType.FOLDER;
	path: string;
	includeSubfolders: boolean;
	negate?: boolean;
}

export interface DateRangeFilter {
	type: FilterType.DATE_RANGE;
	dateType: DateFilterType;
	rangeType: DateRangeType;
	days?: number;
	startDate?: string;
	endDate?: string;
	date?: string;
	negate?: boolean;
}

export interface TextContentFilter {
	type: FilterType.TEXT_CONTENT;
	searchMode: TextSearchMode;
	query: string;
	caseSensitive: boolean;
	negate?: boolean;
}

export interface FileNameFilter {
	type: FilterType.FILE_NAME;
	pattern: string;
	isRegex: boolean;
	negate?: boolean;
}

export type Filter = 
	| TagFilter 
	| FrontmatterFilter 
	| FolderFilter 
	| DateRangeFilter 
	| TextContentFilter 
	| FileNameFilter;

export interface FilterGroup {
	filters: Filter[];
	operator: LogicalOperator;
}

export interface FilterQuery {
	groups: FilterGroup[];
	globalOperator: LogicalOperator;
}

// Support both old format (with FilterQuery) and new format (with search parameters)
export interface FilterBookmark {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	// Old format
	query?: FilterQuery;
	// New format - search parameters
	searchQuery?: string;
	filterTag?: string;
	filterFolder?: string;
	filterDate?: string;
	// Auto-tag settings
	autoTagEnabled?: boolean;
	autoTags?: string;
	tagPlacement?: string;
	// Remove tag settings
	removeFilteredTags?: boolean;
	// Auto-select matching
	autoSelectMatching?: boolean;
	// Backlinks
	includeBacklinks?: boolean;
	// Content selection
	contentSelectionMode?: string;
}

