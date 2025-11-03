import { FilterBookmark } from "../../filters/filterTypes";

export interface FilterConfig {
	bookmarkedFilters: FilterBookmark[];
}

export const DEFAULT_FILTER_SETTINGS: FilterConfig = {
	bookmarkedFilters: []
};

