import { App, Modal } from "obsidian";

export class ElevenLabsApiKeyInfoModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("elevenlabs-api-info-modal-qg");

		// Title
		const title = contentEl.createEl("h2", { text: "ElevenLabs API Key Requirements" });
		title.style.marginTop = "0";

		// Description
		const description = contentEl.createEl("p", {
			text: "For text-to-speech functionality to work, your ElevenLabs API key must have the following permissions enabled:"
		});

		// Required permissions list
		const permissionsList = contentEl.createEl("ul");
		
		const requiredPermissions = [
			{
				section: "Text to Speech",
				permission: "Access",
				description: "Required to generate audio from quiz questions"
			},
			{
				section: "Voices",
				permission: "Read",
				description: "Required to fetch and display available voices"
			},
			{
				section: "User",
				permission: "Read",
				description: "Required to check remaining credits before generating audio"
			}
		];

		requiredPermissions.forEach(perm => {
			const listItem = permissionsList.createEl("li");
			listItem.createEl("strong", { text: `${perm.section}: ` });
			listItem.createEl("span", { text: perm.permission });
			const desc = listItem.createEl("div", { 
				text: perm.description,
				cls: "permission-description-qg"
			});
		});

		// Additional info
		const additionalInfo = contentEl.createEl("p", {
			text: "To configure these permissions, go to your ElevenLabs dashboard and edit your API key settings."
		});
		additionalInfo.style.marginTop = "1.5em";
		additionalInfo.style.fontSize = "0.9em";
		additionalInfo.style.color = "var(--text-muted)";

		// Link to API keys page
		const linkContainer = contentEl.createEl("div");
		linkContainer.style.marginTop = "1em";
		const link = linkContainer.createEl("a", {
			text: "Open ElevenLabs API Key Settings →",
			href: "https://elevenlabs.io/app/settings/api-keys"
		});
		link.style.color = "var(--text-accent)";
		link.addEventListener("click", (e) => {
			e.preventDefault();
			window.open("https://elevenlabs.io/app/settings/api-keys", "_blank");
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

