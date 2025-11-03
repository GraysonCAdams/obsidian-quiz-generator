import { App, CachedMetadata, TFile } from "obsidian";
import {
	DateFilterType,
	DateRangeFilter,
	DateRangeType,
	FileNameFilter,
	Filter,
	FilterQuery,
	FilterType,
	FolderFilter,
	FrontmatterFilter,
	LogicalOperator,
	TagFilter,
	TextContentFilter,
	TextSearchMode
} from "./filterTypes";

export class FilterEvaluator {
	private readonly app: App;

	constructor(app: App) {
		this.app = app;
	}

	public async evaluateQuery(file: TFile, query: FilterQuery): Promise<boolean> {
		if (query.groups.length === 0) {
			return true;
		}

		const groupResults = await Promise.all(
			query.groups.map(group => this.evaluateGroup(file, group.filters, group.operator))
		);

		if (query.globalOperator === LogicalOperator.AND) {
			return groupResults.every(result => result);
		} else {
			return groupResults.some(result => result);
		}
	}

	private async evaluateGroup(file: TFile, filters: Filter[], operator: LogicalOperator): Promise<boolean> {
		if (filters.length === 0) {
			return true;
		}

		const filterResults = await Promise.all(
			filters.map(filter => this.evaluateFilter(file, filter))
		);

		if (operator === LogicalOperator.AND) {
			return filterResults.every(result => result);
		} else {
			return filterResults.some(result => result);
		}
	}

	private async evaluateFilter(file: TFile, filter: Filter): Promise<boolean> {
		let result: boolean;
		
		switch (filter.type) {
			case FilterType.TAG:
				result = this.evaluateTagFilter(file, filter);
				break;
			case FilterType.FRONTMATTER:
				result = this.evaluateFrontmatterFilter(file, filter);
				break;
			case FilterType.FOLDER:
				result = this.evaluateFolderFilter(file, filter);
				break;
			case FilterType.DATE_RANGE:
				result = this.evaluateDateRangeFilter(file, filter);
				break;
			case FilterType.TEXT_CONTENT:
				result = await this.evaluateTextContentFilter(file, filter);
				break;
			case FilterType.FILE_NAME:
				result = this.evaluateFileNameFilter(file, filter);
				break;
			default:
				result = false;
		}
		
		// Apply negation if specified
		return filter.negate ? !result : result;
	}

	private evaluateTagFilter(file: TFile, filter: TagFilter): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return false;

		const tags = this.getAllTags(cache);
		const searchTag = filter.tag.startsWith("#") ? filter.tag : `#${filter.tag}`;
		
		return tags.includes(searchTag);
	}

	private evaluateFrontmatterFilter(file: TFile, filter: FrontmatterFilter): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return filter.operator === "not-exists";

		const frontmatter = cache.frontmatter;
		const propertyValue = frontmatter[filter.property];

		switch (filter.operator) {
			case "exists":
				return propertyValue !== undefined;
			case "not-exists":
				return propertyValue === undefined;
			case "equals":
				if (!filter.value) return false;
				return String(propertyValue) === filter.value;
			case "contains":
				if (!filter.value) return false;
				const valueStr = String(propertyValue);
				return valueStr.toLowerCase().includes(filter.value.toLowerCase());
			default:
				return false;
		}
	}

	private evaluateFolderFilter(file: TFile, filter: FolderFilter): boolean {
		const filePath = file.path;
		const filterPath = filter.path === "/" ? "" : filter.path;

		if (filter.includeSubfolders) {
			return filePath.startsWith(filterPath);
		} else {
			const fileFolder = file.parent?.path || "/";
			return fileFolder === filterPath || (filterPath === "" && fileFolder === "/");
		}
	}

	private evaluateDateRangeFilter(file: TFile, filter: DateRangeFilter): boolean {
		const timestamp = filter.dateType === DateFilterType.MODIFIED 
			? file.stat.mtime 
			: file.stat.ctime;

		const fileDate = new Date(timestamp);
		const now = new Date();

		switch (filter.rangeType) {
			case DateRangeType.LAST_N_DAYS:
				if (!filter.days) return false;
				const daysAgo = new Date(now.getTime() - filter.days * 24 * 60 * 60 * 1000);
				return fileDate >= daysAgo;
			
			case DateRangeType.BEFORE:
				if (!filter.date) return false;
				return fileDate < new Date(filter.date);
			
			case DateRangeType.AFTER:
				if (!filter.date) return false;
				return fileDate > new Date(filter.date);
			
			case DateRangeType.CUSTOM:
				if (!filter.startDate || !filter.endDate) return false;
				const start = new Date(filter.startDate);
				const end = new Date(filter.endDate);
				return fileDate >= start && fileDate <= end;
			
			default:
				return false;
		}
	}

	private async evaluateTextContentFilter(file: TFile, filter: TextContentFilter): Promise<boolean> {
		try {
			const content = await this.app.vault.cachedRead(file);
			
			switch (filter.searchMode) {
				case TextSearchMode.CONTAINS:
					if (filter.caseSensitive) {
						return content.includes(filter.query);
					} else {
						return content.toLowerCase().includes(filter.query.toLowerCase());
					}
				
				case TextSearchMode.EXACT:
					if (filter.caseSensitive) {
						return content === filter.query;
					} else {
						return content.toLowerCase() === filter.query.toLowerCase();
					}
				
				case TextSearchMode.REGEX:
					try {
						const flags = filter.caseSensitive ? "g" : "gi";
						const regex = new RegExp(filter.query, flags);
						return regex.test(content);
					} catch {
						return false;
					}
				
				default:
					return false;
			}
		} catch {
			return false;
		}
	}

	private evaluateFileNameFilter(file: TFile, filter: FileNameFilter): boolean {
		const fileName = file.basename;

		if (filter.isRegex) {
			try {
				const regex = new RegExp(filter.pattern);
				return regex.test(fileName);
			} catch {
				return false;
			}
		} else {
			return fileName.toLowerCase().includes(filter.pattern.toLowerCase());
		}
	}

	private getAllTags(cache: CachedMetadata): string[] {
		const tags: string[] = [];

		// Get tags from frontmatter
		if (cache.frontmatter?.tags) {
			const fmTags = cache.frontmatter.tags;
			if (Array.isArray(fmTags)) {
				tags.push(...fmTags.map(tag => tag.startsWith("#") ? tag : `#${tag}`));
			} else if (typeof fmTags === "string") {
				tags.push(fmTags.startsWith("#") ? fmTags : `#${fmTags}`);
			}
		}

		// Get inline tags
		if (cache.tags) {
			tags.push(...cache.tags.map(tagCache => tagCache.tag));
		}

		return tags;
	}

	public async getMatchingFiles(query: FilterQuery): Promise<TFile[]> {
		const allFiles = this.app.vault.getMarkdownFiles();
		const matchingFiles: TFile[] = [];

		for (const file of allFiles) {
			if (await this.evaluateQuery(file, query)) {
				matchingFiles.push(file);
			}
		}

		return matchingFiles;
	}
}

