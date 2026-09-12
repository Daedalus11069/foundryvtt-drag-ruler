import {
	availableSpeedProviders,
	currentSpeedProvider,
	getDefaultSpeedProvider,
	updateSpeedProvider,
} from "./api.js";
import {EXTRA_TIER_DEFAULT_COLORS, SpeedProvider} from "./speed_provider.js";
import {early_isGM} from "./util.js";

export const settingsKey = "drag-ruler-modern";

export const RightClickAction = Object.freeze({
	CREATE_WAYPOINT: 0,
	DELETE_WAYPOINT: 1,
	ABORT_DRAG: 2,
});

function delayedReload() {
	window.setTimeout(() => location.reload(), 500);
}

export function registerSettings() {
	game.settings.register(settingsKey, "dataVersion", {
		scope: "world",
		config: false,
		type: String,
		default: "fresh install",
	});

	game.settings.register(settingsKey, "clientDataVersion", {
		scope: "client",
		config: false,
		type: String,
		default: "fresh install",
	});

	game.settings.register(settingsKey, "rightClickAction", {
		name: "drag-ruler-modern.settings.rightClickAction.name",
		hint: "drag-ruler-modern.settings.rightClickAction.hint",
		config: true,
		type: Number,
		default: RightClickAction.DELETE_WAYPOINT,
		choices: {
			0: "drag-ruler-modern.settings.rightClickAction.choices.create",
			1: "drag-ruler-modern.settings.rightClickAction.choices.delete",
			2: "drag-ruler-modern.settings.rightClickAction.choices.cancel",
		},
	});

	game.settings.register(settingsKey, "autoStartMeasurement", {
		name: "drag-ruler-modern.settings.autoStartMeasurement.name",
		hint: "drag-ruler-modern.settings.autoStartMeasurement.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
	});

	game.settings.register(settingsKey, "useGridlessRaster", {
		name: "drag-ruler-modern.settings.useGridlessRaster.name",
		hint: "drag-ruler-modern.settings.useGridlessRaster.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
	});

	game.settings.register(settingsKey, "alwaysShowSpeedForPCs", {
		name: "drag-ruler-modern.settings.alwaysShowSpeedForPCs.name",
		hint: "drag-ruler-modern.settings.alwaysShowSpeedForPCs.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	// game.settings.register(settingsKey, "showGMRulerToPlayers", {
	// 	name: "drag-ruler-modern.settings.showGMRulerToPlayers.name",
	// 	hint: "drag-ruler-modern.settings.showGMRulerToPlayers.hint",
	// 	scope: "world",
	// 	config: true,
	// 	type: Boolean,
	// 	default: true,
	// });

	game.settings.register(settingsKey, "enableMovementHistory", {
		name: "drag-ruler-modern.settings.enableMovementHistory.name",
		hint: "drag-ruler-modern.settings.enableMovementHistory.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	if (game.modules.get("routinglib")?.active) {
		game.settings.register(settingsKey, "allowPathfinding", {
			name: "drag-ruler-modern.settings.allowPathfinding.name",
			hint: "drag-ruler-modern.settings.allowPathfinding.hint",
			scope: "world",
			config: true,
			type: Boolean,
			default: false,
			onChange: delayedReload,
		});

		game.settings.register(settingsKey, "autoPathfinding", {
			name: "drag-ruler-modern.settings.autoPathfinding.name",
			hint: "drag-ruler-modern.settings.autoPathfinding.hint",
			scope: "client",
			config: early_isGM() || game.settings.get(settingsKey, "allowPathfinding"),
			type: Boolean,
			default: false,
		});
	}

	game.settings.register(settingsKey, "lastTerrainRulerHintTime", {
		config: false,
		type: Number,
		default: 0,
	});

	game.settings.register(settingsKey, "neverShowTerrainRulerHint", {
		config: false,
		type: Boolean,
		default: false,
	});

	// Movement type attribute paths
	game.settings.register(settingsKey, "movementTypes", {
		scope: "world",
		config: false,
		type: Object,
		default: {
			walk: {
				enabled: true,
				attribute: "",
			},
			fly: {
				enabled: false,
				attribute: "",
			},
			burrow: {
				enabled: false,
				attribute: "",
			},
			swim: {
				enabled: false,
				attribute: "",
			},
			climb: {
				enabled: false,
				attribute: "",
			},
			crawl: {
				enabled: false,
				attribute: "",
			},
			jump: {
				enabled: false,
				attribute: "",
			},
			blink: {
				enabled: false,
				attribute: "",
			},
		},
	});

	// User-defined additional speed tiers for the built-in Generic Speed Provider.
	// Array of {id, label, multiplier, color}. The GM can add/remove entries freely
	// from the Speed Provider Settings dialog.
	game.settings.register(settingsKey, "genericSpeedProviderTiers", {
		scope: "world",
		config: false,
		type: Array,
		default: [],
	});

	// This setting will be modified by the api if modules register to it
	game.settings.register(settingsKey, "speedProvider", {
		scope: "world",
		config: false,
		type: String,
		default: getDefaultSpeedProvider(),
		onChange: updateSpeedProvider,
	});

	game.settings.registerMenu(settingsKey, "speedProviderSettings", {
		name: "drag-ruler-modern.settings.speedProviderSettings.name",
		hint: "drag-ruler-modern.settings.speedProviderSettings.hint",
		label: "drag-ruler-modern.settings.speedProviderSettings.button",
		icon: "fas fa-tachometer-alt",
		type: SpeedProviderSettings,
		restricted: false,
	});
}

class SpeedProviderSettings extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "drag-ruler-speed-provider-settings",
		tag: "form",
		form: {
			handler: SpeedProviderSettings._onSubmit,
			submitOnChange: false,
			closeOnSubmit: false,
		},
		window: {
			title: "drag-ruler-modern.settings.speedProviderSettings.windowTitle",
			contentClasses: ["standard-form"],
		},
		position: {
			width: 600,
		},
		actions: {
			save: SpeedProviderSettings._onSave,
		},
	};

	static PARTS = {
		form: {
			template: "modules/drag-ruler-modern/templates/speed_provider_settings.html",
		},
	};

	async _prepareContext(options = {}) {
		const data = {};
		data.isGM = game.user.isGM;
		const selectedProvider = currentSpeedProvider.id;

		// Insert all speed providers into the template data
		data.providers = Object.values(availableSpeedProviders).map(speedProvider => {
			const provider = {};
			provider.id = speedProvider.id;
			provider.hasSettings = speedProvider instanceof SpeedProvider;
			if (provider.hasSettings) provider.settings = enumerateProviderSettings(speedProvider);
			provider.isNative = provider.id === "native";
			if (provider.isNative) {
				const tiers = game.settings.get(settingsKey, "genericSpeedProviderTiers");
				provider.extraTiers = tiers.map((tier, index) => ({
					id: tier.id,
					label: tier.label,
					multiplier: tier.multiplier,
					colorSettingId: `native.color.${tier.id}`,
					colorHex: toDomHex(
						ensureTierColorSetting(tier.id, EXTRA_TIER_DEFAULT_COLORS[index % EXTRA_TIER_DEFAULT_COLORS.length]),
					),
				}));
				// Each extra tier's color is already shown inline in the tier row above;
				// don't also show it in the generic flat settings list below.
				const tierColorIds = new Set(tiers.map(tier => `${provider.id}.color.${tier.id}`));
				provider.settings = provider.settings.filter(setting => !tierColorIds.has(setting.id));
			}
			let dotPosition = provider.id.indexOf(".");
			if (dotPosition === -1) dotPosition = provider.id.length;
			const type = provider.id.substring(0, dotPosition);
			const id = provider.id.substring(dotPosition + 1);
			if (type === "native") {
				provider.selectTitle = game.i18n.localize(
					"drag-ruler-modern.settings.speedProviderSettings.speedProvider.choices.native",
				);
			} else {
				let name;
				if (type === "module") {
					name = game.modules.get(id).title;
				} else {
					name = game.system.title;
				}
				provider.selectTitle = game.i18n.format(
					`drag-ruler-modern.settings.speedProviderSettings.speedProvider.choices.${type}`,
					{name},
				);
			}
			provider.isSelected = provider.id === selectedProvider;
			return provider;
		});
		data.selectedProviderName = data.providers.find(provider => provider.isSelected).selectTitle;

		data.providerSelection = {
			id: "speedProvider",
			name: game.i18n.localize("drag-ruler-modern.settings.speedProviderSettings.speedProvider.name"),
			hint: game.i18n.localize("drag-ruler-modern.settings.speedProviderSettings.speedProvider.hint"),
			type: String,
			choices: data.providers.reduce((choices, provider) => {
				choices[provider.id] = provider.selectTitle;
				return choices;
			}, {}),
			value: selectedProvider,
			isCheckbox: false,
			isSelect: true,
			isRange: false,
		};
		
		// Add movement types data
		const movementTypes = game.settings.get(settingsKey, "movementTypes");
		data.movementTypes = Object.entries(movementTypes).map(([key, value]) => ({
			key,
			name: game.i18n.localize(`drag-ruler-modern.movementTypes.${key}`),
			...value,
		}));
		
		return data;
	}

	static async _onSubmit(event, form, formData) {
		// Form submission is handled by save action button
	}

	static async _onSave(event, target) {
		event.preventDefault();

		// Get the form element and extract form data
		const form = this.element.querySelector("form");
		const formData = new foundry.applications.ux.FormDataExtended(form).object;

		// Gather the dynamic speed tier rows (label/multiplier inputs have no `name` attribute
		// so FormDataExtended never sees them; read them directly from the DOM instead).
		// Row order is preserved so the GM's manual reordering sticks.
		if (game.user.isGM) {
			const tiers = [];
			for (const row of form.querySelectorAll(".drag-ruler-tier-table tbody tr")) {
				const label = row.querySelector(".drag-ruler-tier-label")?.value?.trim() ?? "";
				const multiplier = parseFloat(row.querySelector(".drag-ruler-tier-multiplier")?.value) || 0;
				if (!label && !multiplier) continue;
				tiers.push({id: row.dataset.tierId, label, multiplier});
			}
			await game.settings.set(settingsKey, "genericSpeedProviderTiers", tiers);
		}

		const selectedSpeedProvider = game.user.isGM
			? formData.speedProvider
			: game.settings.get(settingsKey, "speedProvider");
		
		// Handle movement types separately
		const movementTypes = {};
		const movementKeys = ["walk", "fly", "burrow", "swim", "climb", "crawl", "jump", "blink"];
		for (const key of movementKeys) {
			if (`${key}.enabled` in formData || `${key}.attribute` in formData) {
				movementTypes[key] = {
					enabled: formData[`${key}.enabled`] || false,
					attribute: formData[`${key}.attribute`] || "",
				};
				delete formData[`${key}.enabled`];
				delete formData[`${key}.attribute`];
			}
		}
		if (Object.keys(movementTypes).length > 0) {
			const existingMovementTypes = game.settings.get(settingsKey, "movementTypes");
			await game.settings.set(settingsKey, "movementTypes", {...existingMovementTypes, ...movementTypes});
		}
		
		for (let [key, value] of Object.entries(formData)) {
			// Check if this is color, convert the value to an integer
			const splitKey = key.split(".", 3);
			if (splitKey[0] !== "native") splitKey.shift();
			if (splitKey.length >= 2 && splitKey[1] == "color") {
				value = parseInt(value.substring(1), 16);
			}

			// Don't change settings for speed providers that aren't currently active
			if (key !== "speedProvider" && !key.startsWith(selectedSpeedProvider)) continue;

			// Get the key for the current setting
			let setting;
			if (key === "speedProvider") setting = "speedProvider";
			else setting = `speedProviders.${key}`;

			// Get the old setting value
			const oldValue = game.settings.get(settingsKey, setting);

			// Only update the setting if it has been changed (this leaves the default in place if it hasn't been touched)
			if (value !== oldValue) game.settings.set(settingsKey, setting, value);
		}

		// Activate the configured speed provider
		updateSpeedProvider();
		
		// Trigger recalculation of active rulers to apply new settings immediately
		// Call recalculation directly (not through sockets) since we're updating locally
		recalculateActiveRulers();

		// Close the dialog
		this.close();
	}

	_onRender(context, options) {
		const html = this.element;
		html.querySelector("select[name=speedProvider]")?.addEventListener("change", this._onSpeedProviderChange.bind(this));

		const tierBody = html.querySelector(".drag-ruler-tier-table tbody");

		html.querySelector(".drag-ruler-add-tier")?.addEventListener("click", () => {
			if (!tierBody) return;
			const id = `tier-${foundry.utils.randomID()}`;
			const index = tierBody.querySelectorAll("tr").length;
			const defaultColor = ensureTierColorSetting(
				id,
				EXTRA_TIER_DEFAULT_COLORS[index % EXTRA_TIER_DEFAULT_COLORS.length],
			);
			const row = document.createElement("tr");
			row.dataset.tierId = id;
			row.innerHTML = SpeedProviderSettings._tierRowCellsHTML({
				label: "",
				multiplier: 1,
				colorSettingId: `native.color.${id}`,
				colorHex: toDomHex(defaultColor),
			});
			tierBody.appendChild(row);
			this.setPosition({height: "auto"});
		});

		tierBody?.addEventListener("click", async event => {
			const row = event.target.closest("tr");
			if (!row) return;

			if (event.target.closest(".drag-ruler-tier-up")) {
				const prev = row.previousElementSibling;
				if (prev) tierBody.insertBefore(row, prev);
				return;
			}

			if (event.target.closest(".drag-ruler-tier-down")) {
				const next = row.nextElementSibling;
				if (next) tierBody.insertBefore(next, row);
				return;
			}

			if (event.target.closest(".drag-ruler-remove-tier")) {
				const label = row.querySelector(".drag-ruler-tier-label")?.value?.trim() || row.dataset.tierId;
				const confirmed = await foundry.applications.api.DialogV2.confirm({
					window: {
						title: game.i18n.localize("drag-ruler-modern.settings.speedProviderSettings.tiers.confirmDeleteTitle"),
					},
					content: `<p>${game.i18n.format(
						"drag-ruler-modern.settings.speedProviderSettings.tiers.confirmDeleteContent",
						{label},
					)}</p>`,
				});
				if (confirmed) {
					row.remove();
					this.setPosition({height: "auto"});
				}
			}
		});
	}

	static _tierRowCellsHTML({label, multiplier, colorSettingId, colorHex}) {
		return `
			<td><input type="text" class="drag-ruler-tier-label" value="${label}" placeholder="e.g. Run x3" style="width: 100%;" /></td>
			<td><input type="number" class="drag-ruler-tier-multiplier" value="${multiplier}" step="0.1" min="0" style="width: 100%;" /></td>
			<td><input type="color" name="${colorSettingId}" value="${colorHex}" /></td>
			<td style="white-space: nowrap; text-align: center;">
				<button type="button" class="drag-ruler-tier-up" title="${game.i18n.localize("drag-ruler-modern.settings.speedProviderSettings.tiers.moveUp")}"><i class="fas fa-arrow-up"></i></button>
				<button type="button" class="drag-ruler-tier-down" title="${game.i18n.localize("drag-ruler-modern.settings.speedProviderSettings.tiers.moveDown")}"><i class="fas fa-arrow-down"></i></button>
			</td>
			<td style="text-align: center;"><button type="button" class="drag-ruler-remove-tier" title="${game.i18n.localize("drag-ruler-modern.settings.speedProviderSettings.tiers.remove")}"><i class="fas fa-trash"></i></button></td>
		`;
	}

	_onSpeedProviderChange(event) {
		// Hide all module settings
		this.element
			.querySelectorAll(".drag-ruler-provider-settings")
			.forEach(element => (element.style.display = "none"));
		// Show the settings block for the currently selected module
		const selectedElement = this.element.querySelector(`#drag-ruler-modern\\.provider\\.${event.currentTarget.value}`);
		if (selectedElement) selectedElement.style.display = "";

		// Recalculate window height
		this.setPosition({height: "auto"});
	}
}

// Clears cached ranges and forces active rulers to re-measure, so that settings changes
// (made through the dialog or through the API) are reflected immediately.
export function recalculateActiveRulers() {
	const ruler = canvas?.controls?.ruler;
	if (ruler?.waypoints?.length > 0 && ruler.dragRulerRecalculate) {
		ruler.dragRulerRecalculate();
	}

	if (canvas?.tokens?.placeables) {
		for (const token of canvas.tokens.placeables) {
			if (token.ruler?.waypoints?.length > 0 && token.ruler.dragRulerRecalculate) {
				token.ruler.dragRulerRecalculate();
			}
		}
	}
}

// Registers (if not already registered) the per-client color setting for one extra speed tier
// and returns its current value. Registering lazily like this lets a newly added tier get a
// working color picker immediately, without waiting for a page reload.
export function ensureTierColorSetting(tierId, defaultColor) {
	const key = `speedProviders.native.color.${tierId}`;
	if (!game.settings.settings.has(`${settingsKey}.${key}`)) {
		game.settings.register(settingsKey, key, {
			config: false,
			scope: "client",
			type: Number,
			default: defaultColor,
		});
	}
	return game.settings.get(settingsKey, key);
}

function toDomHex(value) {
	const hex = value.toString(16);
	return "#" + "0".repeat(Math.max(0, 6 - hex.length)) + hex;
}

function enumerateProviderSettings(provider) {
	const colorSettings = [];
	const unreachableColor = {
		id: "unreachable",
		name: "drag-ruler-modern.settings.speedProviderSettings.color.unreachable.name",
	};

	// Resolve settings for the colors
	for (const color of provider.colors.concat([unreachableColor])) {
		if (!color) continue; // Skip undefined/null colors
		// Localize the name, if avaliable. If no name is available use the id as name
		const colorName = color.name ? game.i18n.localize(color.name) : color.id;
		let hint;
		if (color === unreachableColor)
			hint = game.i18n.localize("drag-ruler-modern.settings.speedProviderSettings.color.unreachable.hint");
		else
			hint = game.i18n.format("drag-ruler-modern.settings.speedProviderSettings.color.hint", {colorName});
		colorSettings.push({
			id: `${provider.id}.color.${color.id}`,
			name: game.i18n.format("drag-ruler-modern.settings.speedProviderSettings.color.name", {colorName}),
			hint: hint,
			type: Number,
			value: toDomHex(
				game.settings.get(settingsKey, `speedProviders.${provider.id}.color.${color.id}`),
			),
			isCheckbox: false,
			isSelect: false,
			isRange: false,
			isColor: true,
		});
	}

	// Prepare regular settings
	const settings = [];
	for (const setting of provider.settings) {
		if (!setting) continue; // Skip undefined/null settings
		try {
			if (setting.scope === "world" && !game.user.isGM) continue;
			const s = foundry.utils.duplicate(setting);
			s.id = `${provider.id}.setting.${s.id}`;
			s.name = game.i18n.localize(s.name);
			s.hint = game.i18n.localize(s.hint);
			s.value = provider.getSetting(setting.id);
			s.type = setting.type instanceof Function ? setting.type.name : "String";
			s.isCheckbox = setting.type === Boolean;
			s.isSelect = s.choices !== undefined;
			s.isRange = setting.type === Number && s.range;
			s.isColor = false;
			settings.push(s);
		} catch (e) {
			console.warn(
				`Drag Ruler Modern | The following error occured while rendering setting "${setting.id}" of module/system "${this.id}. It won't be displayed.`,
			);
			console.error(e);
		}
	}

	return settings.concat(colorSettings);
}
