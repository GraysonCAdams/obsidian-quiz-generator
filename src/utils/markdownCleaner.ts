export const cleanUpNoteContents = (noteContents: string, hasFrontMatter: boolean): string => {
	let cleanedContents = noteContents;
	if (hasFrontMatter) {
		cleanedContents = removeFrontMatter(cleanedContents);
	}
	cleanedContents = removeObsidianComments(cleanedContents);
	cleanedContents = removeMetadataCodeBlocks(cleanedContents);
	cleanedContents = removeTodoItems(cleanedContents);
	cleanedContents = removeAnecdotalCallouts(cleanedContents);
	cleanedContents = cleanUpLinks(cleanedContents);
	cleanedContents = removeMarkdownHeadings(cleanedContents);
	cleanedContents = removeMarkdownFormatting(cleanedContents);
	return cleanUpWhiteSpace(cleanedContents);
};

const removeFrontMatter = (input: string): string => {
	const yamlFrontMatterRegex = /---[\s\S]+?---\n/;
	return input.replace(yamlFrontMatterRegex, "");
};

const removeObsidianComments = (input: string): string => {
	// Remove Obsidian comments: %%comment%%
	const commentRegex = /%%[\s\S]*?%%/g;
	return input.replace(commentRegex, "");
};

const removeMetadataCodeBlocks = (input: string): string => {
	// Remove code blocks that are Obsidian plugin metadata/commands, not actual code content
	// Common plugins: button, todoist, dataview, tasks, tracker, etc.
	const metadataPlugins = [
		'button',
		'todoist',
		'dataview',
		'dataviewjs',
		'tasks',
		'tracker',
		'breadcrumbs',
		'kanban',
		'excalidraw',
		'mermaid',
		'chart',
		'timeline'
	];
	
	let result = input;
	
	// Remove code blocks with these language identifiers
	for (const plugin of metadataPlugins) {
		// Match ```plugin ... ``` code blocks
		const codeBlockRegex = new RegExp(
			`\`\`\`${plugin}[\\s\\S]*?\`\`\``,
			'gi'
		);
		result = result.replace(codeBlockRegex, "");
	}
	
	return result;
};

const removeTodoItems = (input: string): string => {
	// Remove todo list items: - [ ], - [x], - [X], etc.
	const todoRegex = /^[\s]*[-*+]\s+\[[^\]]*\].*$/gm;
	return input.replace(todoRegex, "");
};

const removeAnecdotalCallouts = (input: string): string => {
	// Remove callouts that are typically anecdotal or non-study material
	// These callout types are usually personal notes, todos, or side thoughts
	const anecdotalCallouts = ['todo', 'aside'];
	let result = input;
	
	for (const calloutType of anecdotalCallouts) {
		// Match callouts with optional +/- and their content until the next heading or callout
		const calloutRegex = new RegExp(
			`^>\\s*\\[!${calloutType}\\][+-]?\\s*.*$(?:\\n^>.*$)*`,
			'gmi'
		);
		result = result.replace(calloutRegex, "");
	}
	
	return result;
};

const cleanUpLinks = (input: string): string => {
	const wikiLinkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))??]]/;
	const markdownLinkPattern = /\[([^\]]+)]\([^)]+\)/;

	const combinedRegex = new RegExp(`${wikiLinkPattern.source}|${markdownLinkPattern.source}`, "g");

	return input.replace(combinedRegex, (match, wikiLink, wikiDisplayText, markdownLink) => {
		return wikiDisplayText ?? wikiLink ?? markdownLink;
	});
};

const removeMarkdownHeadings = (input: string): string => {
	const headingRegex = /^(#+.*)$/gm;
	return input.replace(headingRegex, "");
};

const removeMarkdownFormatting = (input: string): string => {
	const markdownFormattingRegex = /([*_]{1,3}|~~|==|%%)(.*?)\1/g;
	return input.replace(markdownFormattingRegex, "$2");
};

const cleanUpWhiteSpace = (input: string): string => {
	const consecutiveSpacesRegex = /\s+/g;
	return input.replace(consecutiveSpacesRegex, " ").trim();
};
