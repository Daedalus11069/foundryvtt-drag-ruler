import {ensureTierColorSetting, recalculateActiveRulers, settingsKey} from "./settings.js";
import {getDefaultDashMultiplier, getDefaultSpeedAttribute} from "./systems.js";

/**
 * Base class for all speed providers.
 * If you want to offer a speed provider in your system/module you must derive this class.
 * Each speed provider must at least implement
 */
export class SpeedProvider {
	/**
	 * Returns an array of colors used by this speed provider. Each color corresponds to one speed that a token may have.
	 * Each color must be an object with the following properties:
	 * - id: A value that identfies the color. Must be unique for each color returned.
	 * - default: The color that is used to highlight that speed by default.
	 * - name: A user readable name for the speed represented by the color. This name is used in the color configuration dialog. Drag Ruler will attempt to localize this string using `game.i18n`
	 *
	 * Of these properties, id and defaultColor are required. name is optional, but it's recommended to set it
	 *
	 * Implementing this method is required for all speed providers
	 */
	get colors() {
		throw new Error("A SpeedProvider must implement the colors function");
	}

	/**
	 * Returns an array of speeds that the token passed in the arguments this token can reach.
	 * Each range is an object that with the following properties:
	 * - range: A number indicating the distance that the token can travel with this speed
	 * - color: The id (as defined in the `colors` getter) of the color that should be used to represent this range
	 *
	 * Implementing this method is required for all speed providers
	 */
	getRanges(token) {
		throw new Error("A SpeedProvider must implement the getRanges function");
	}

	/**
	 * Returns an array of configuration options for this module. The settings will be shown in the Speed Provider Settings of Drag Ruler.
	 * Each configuration option is an object that has the same attributes as a native foundry setting passed to `game.settings.register`,
	 * except for these exceptions:
	 * - id: A string that identifies the setting. Must be unique for each setting returned. This id will be used to fetch the setting.
	 * - config: This property is not supported by Drag Ruler module settings. Use foundries native settings instead if you need settings that don't show up in the configuration dialog.
	 *
	 * Implementing this method is optional and only needs to be done if you want to provide custom provider settings
	 */
	get settings() {
		return [];
	}

	/**
	 * Returns the default color for ranges that a token cannot reach.
	 *
	 * Implementing this method is optional and only needs to be done if you want to provide a custom default for that color.
	 */
	get defaultUnreachableColor() {
		return 0xff0000;
	}

	/**
	 * Returns a boolean indicating whether this token will use a Ruler or not.
	 * If this is returns `false` for a token Drag Ruler will be disabled for that token. Dragging a token for which this function
	 * returns false will behave as if Drag Ruler wasn't installed.
	 * If usesRuler returns `false` it's guranteed that the `getRanges` function won't be called for that token.
	 *
	 * Implementing this method is optional and only needs to be done if you want to disable Drag Ruler for some tokens.
	 */
	usesRuler(token) {
		return true;
	}

	/**
	 * This hook is being called after Drag Ruler has updated the movement history for one or more tokens.
	 * It'll receive an array of tokens that have been updated.
	 * If your speed provider is storing any additional values that are relevant for the movement history, this function should
	 * await until those updates have completed inside foundry.
	 */
	async onMovementHistoryUpdate(tokens) {}

	/**
	 * Returns the value that is currently set for the setting registered with the provided settingId.
	 *
	 * This function shouldn't be overridden by speed provider implementations. It can be called to fetch speed provider specific settings.
	 */
	getSetting(settingId) {
		try {
			return game.settings.get(settingsKey, `speedProviders.${this.id}.setting.${settingId}`);
		} catch (e) {
			if (this.settings.some(setting => setting.id === settingId)) {
				throw e;
			}
			throw new Error(
				`Drag Ruler Modern | "${settingId}" is not a registered setting for "${this.id}". If you're the module/system developer, please add it to the return values of your Speed Providers "get settings()" function.`,
			);
		}
	}

	/**
	 * Constructs a new instance of he speed provider
	 *
	 * This function should neither be called or overridden by speed provider implementations
	 */
	constructor(id) {
		this.id = id;
	}
}

// User-defined speed tiers beyond walk/dash, stored as a plain array of
// {id, label, multiplier} objects in the "genericSpeedProviderTiers" world setting.
// The GM can add or remove as many of these as they like from the Speed Provider Settings dialog;
// each tier's color is then configured through the regular per-color setting like walk/dash.
export function getExtraSpeedTiers() {
	try {
		return game.settings.get(settingsKey, "genericSpeedProviderTiers") ?? [];
	} catch (e) {
		return [];
	}
}

// Rotating default colors handed to newly added tiers before the GM picks their own.
export const EXTRA_TIER_DEFAULT_COLORS = [0xffa500, 0xff8c00, 0xff1493, 0x8a2be2, 0x1e90ff, 0x00ced1];

/**
 * Adds a new speed tier to the built-in Generic Speed Provider. World-scoped; requires GM.
 *
 * @param {object} options
 * @param {string} [options.label] - A user readable name for the tier, shown in the settings dialog.
 * @param {number} options.multiplier - The tier's range is the token's speed multiplied by this value.
 * @param {number} [options.color] - The tier's initial color (e.g. 0xff8800). Defaults to a rotating palette entry.
 * @returns {Promise<string>} The id of the newly created tier, e.g. for later use with updateSpeedTier/removeSpeedTier.
 */
export async function addSpeedTier({label = "", multiplier, color} = {}) {
	if (!game.user.isGM) throw new Error("Drag Ruler Modern | Only a GM can add speed tiers");
	if (!(multiplier > 0)) throw new Error("Drag Ruler Modern | addSpeedTier requires a positive multiplier");

	const tiers = getExtraSpeedTiers();
	const id = `tier-${foundry.utils.randomID()}`;
	const resolvedColor = color ?? EXTRA_TIER_DEFAULT_COLORS[tiers.length % EXTRA_TIER_DEFAULT_COLORS.length];
	ensureTierColorSetting(id, resolvedColor);
	await game.settings.set(settingsKey, "genericSpeedProviderTiers", [...tiers, {id, label, multiplier}]);
	if (color !== undefined) await game.settings.set(settingsKey, `speedProviders.native.color.${id}`, color);
	recalculateActiveRulers();
	return id;
}

/**
 * Updates an existing speed tier's label, multiplier and/or color. Only the provided fields are changed.
 * Label/multiplier changes are world-scoped (require GM); color changes are per-client and can be made by anyone.
 *
 * @param {string} id - The id returned by addSpeedTier (or found via getExtraSpeedTiers).
 * @param {object} changes
 * @param {string} [changes.label]
 * @param {number} [changes.multiplier]
 * @param {number} [changes.color]
 */
export async function updateSpeedTier(id, {label, multiplier, color} = {}) {
	if (label !== undefined || multiplier !== undefined) {
		if (!game.user.isGM) throw new Error("Drag Ruler Modern | Only a GM can rename/retune speed tiers");
		const tiers = getExtraSpeedTiers();
		const tier = tiers.find(t => t.id === id);
		if (!tier) throw new Error(`Drag Ruler Modern | No speed tier with id "${id}" exists`);
		if (label !== undefined) tier.label = label;
		if (multiplier !== undefined) {
			if (!(multiplier > 0)) throw new Error("Drag Ruler Modern | multiplier must be a positive number");
			tier.multiplier = multiplier;
		}
		await game.settings.set(settingsKey, "genericSpeedProviderTiers", tiers);
	}
	if (color !== undefined) {
		ensureTierColorSetting(id, color);
		await game.settings.set(settingsKey, `speedProviders.native.color.${id}`, color);
	}
	recalculateActiveRulers();
}

/**
 * Removes a speed tier previously added with addSpeedTier. World-scoped; requires GM.
 *
 * @param {string} id - The id of the tier to remove.
 */
export async function removeSpeedTier(id) {
	if (!game.user.isGM) throw new Error("Drag Ruler Modern | Only a GM can remove speed tiers");
	const tiers = getExtraSpeedTiers().filter(tier => tier.id !== id);
	await game.settings.set(settingsKey, "genericSpeedProviderTiers", tiers);
	recalculateActiveRulers();
}

export class GenericSpeedProvider extends SpeedProvider {
	get colors() {
		const colors = [
			{id: "walk", default: 0x00ff00, name: "drag-ruler-modern.genericSpeedProvider.speeds.walk"},
			{id: "dash", default: 0xffff00, name: "drag-ruler-modern.genericSpeedProvider.speeds.dash"},
		];
		getExtraSpeedTiers().forEach((tier, index) => {
			colors.push({
				id: tier.id,
				default: EXTRA_TIER_DEFAULT_COLORS[index % EXTRA_TIER_DEFAULT_COLORS.length],
				name: tier.label || tier.id,
			});
		});
		return colors;
	}

	getRanges(token) {
		// Check movement types first
		const movementTypes = game.settings.get(settingsKey, "movementTypes");
		let tokenSpeed = null;
		
		// Try to find an enabled movement type with a configured attribute
		for (const [key, config] of Object.entries(movementTypes)) {
			if (config.enabled && config.attribute) {
				const speed = parseFloat(foundry.utils.getProperty(token, config.attribute));
				if (speed !== undefined && !isNaN(speed)) {
					tokenSpeed = speed;
					break;
				}
			}
		}
		
		// Fall back to speed attribute if no movement type matched
		if (tokenSpeed === null) {
			const speedAttribute = this.getSetting("speedAttribute");
			if (!speedAttribute) return [];
			tokenSpeed = parseFloat(foundry.utils.getProperty(token, speedAttribute));
			if (tokenSpeed === undefined) {
				console.warn(
					`Drag Ruler (Generic Speed Provider) | The configured token speed attribute "${speedAttribute}" didn't return a speed value. To use colors based on drag distance set the setting to the correct value (or clear the box to disable this feature).`,
				);
				return [];
			}
		}
		
		const ranges = [{range: tokenSpeed, color: "walk"}];

		const dashMultiplier = this.getSetting("dashMultiplier");
		if (dashMultiplier) ranges.push({range: tokenSpeed * dashMultiplier, color: "dash"});

		for (const tier of getExtraSpeedTiers()) {
			if (!tier.multiplier) continue;
			ranges.push({range: tokenSpeed * tier.multiplier, color: tier.id});
		}

		// Ranges must be sorted ascending so getColorForDistanceAndToken can find the smallest matching tier.
		ranges.sort((a, b) => a.range - b.range);
		return ranges;
	}

	get settings() {
		const settings = [
			{
				id: "speedAttribute",
				name: "drag-ruler-modern.genericSpeedProvider.settings.speedAttribute.name",
				hint: "drag-ruler-modern.genericSpeedProvider.settings.speedAttribute.hint",
				scope: "world",
				config: true,
				type: String,
				default: getDefaultSpeedAttribute(),
			},
			{
				id: "dashMultiplier",
				name: "drag-ruler-modern.genericSpeedProvider.settings.dashMultiplier.name",
				hint: "drag-ruler-modern.genericSpeedProvider.settings.dashMultiplier.hint",
				scope: "world",
				config: true,
				type: Number,
				default: getDefaultDashMultiplier(),
			},
		];
		return settings;
	}
}
