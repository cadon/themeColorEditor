// ****************************************************
//         theme color editor for wiki.gg wikis
// ****************************************************
// MIT License
// 
// Copyright (c) 2025 cadaei (https://github.com/cadon)
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// ****************************************************
//
// # Theme Color Editor
// Theme color editor for wiki.gg wikis.
// 
// ## Features
// * Adjust color variables of wiki themes with a color picker or indirect definitions based on other colors
// * Live preview of the set colors on other wiki pages
// * Display of needed contrasts between colors
// * buttons for automatic contrast fixing
//
// ## How to use
// Run this script in the browser console of a wiki page with a specific table of defined color variables, e.g. on ...wiki.gg/wiki/MediaWiki:Common.css. The variable table needs to have the following format
//
// <table>
//   <tr>
//     <th>Variable name</th>
//     <th>Color</th>
//     <th>Notes</th>
//     <th>Test contrast against these variables</th>
//   </tr>
//   <tr>
//     <td>--wiki-body-background-color
//     </td>
//     <td style="background-color:var(--wiki-body-background-color);"></td>
//     <td>The background color behind the background image.</td>
//     <td style="background-color:var(--wiki-body-background-color);">
//         <p><span style="color:var(--wiki-body-dynamic-color);">--wiki-body-dynamic-color</span><br>
//             <span style="color:var(--wiki-body-dynamic-color--secondary);" data-min-contrast="3">--wiki-body-dynamic-color--secondary</span>
//         </p>
//     </td>
//   </tr>
// </table>
// ***************************************************
"use strict";

const themeColorEditor = {
    /**
     * Contains info about the css variables edited by the user.
     * Key is the variable name, value is the variableInfo.
     */
    variableInfo: new Map(),
    colorPicker: undefined,
    /**
     * Clipboard-like variable used to copy/paste colors
     */
    holdVariable: null,
    /**
     * If true and a variable has an --rgb variant, it's included in the output
     */
    exportIncludeRgbVariants: false,
    /**
     * If true the explicit color adjustment options are also exported. Used to save work on a theme and import again in a later session.
     */
    exportIncludeExplicitOptions: false,
    /**
     * references to preview popups where the styles are applied.
     */
    previewPopups: [],
    /**
     * Save the background style. For theme adjusting this needs to be an explicit defintion (not a variable)
     * to avoid flickering when changing other variables in high intervals. If a theme changes the background
     * the initial definition is needed.
     */
    initialBackgroundDefinition: null,

    /**
     * collection of base css, key is name (e.g. view-light, view-dark, theme-my-theme-name)
     * value is map of rules (key: var name, value: var value)
     */
    baseCss: new Map(),
    themeBaseDark: false,
    themeBaseSelector: undefined,
    /**
     * container for textarea to import/export themes.
     */
    inOutStyleSheetEl: undefined,
    /**
     * textarea to import/export themes.
     */
    inOutTextarea: undefined,

    initialize: function () {
        this.addToolbar();
        this.colorPicker = new this.ColorPicker(document.body);
        this.parseBaseThemes();
        this.addThemesToSelector();
        this.parseVariables();
        this.initializeVariables();
        this.addThemeColorEditorCssStyles();
    },

    //#region color parsing
    /**
     * Parses a color from a string, accepts input like '#ff113a', 'rgb(24, 144, 0)'.
     * @param {string} colorRepresentation 
     * @returns {number[] | null} color as number[], e.g. [24, 144, 0] or null if invalid.
     */
    parseColor: function (colorRepresentation) {
        if (!colorRepresentation) return null;
        if (colorRepresentation.startsWith('#'))
            return this.hexToRgb(colorRepresentation.substring(1));
        // try parsing other color formats
        const colorRgb = this.rgbParenthesisToRgb(colorRepresentation);
        if (colorRgb) return colorRgb;
        // unsupported color format, maybe dependent on other colors or vars
        console.warn(`couldn't parse color ${colorRepresentation}`);
        return null;
    },

    /**
     * Parses an RGB color string in the format 'rgb(39, 34, 102)' or 'color(srgb 0.4, 1, 0.2)'.
     * @param {string} rgbString 
     * @returns {number[] | null} RGB values as an array, or null if parsing fails.
     */
    rgbParenthesisToRgb: function (rgbString) {
        // parse e.g. rgb(39, 34,102)
        let rgbMatch = rgbString.match(/(?:rgb\()?(\d+)[\s,]+(\d+)[\s,]+(\d+)\)?/);
        if (rgbMatch)
            return rgbMatch.slice(1, 4).map(Number);
        // parse e.g. color(srgb 0.4, 1, 0.2)
        rgbMatch = rgbString.match(/color\(srgb\s+([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\)?/);
        if (rgbMatch)
            return rgbMatch.slice(1, 4).map(v => Math.round(parseFloat(v) * 255));

        console.warn(`couldn't parse color ${rgbString}`);
        return null;
    },

    /**
     * Parses a color given with 3 or 6 hex digits (without #).
     * @param {string} hexString 
     * @param {boolean} logErrors (optional) whether to log errors.
     * @returns {number[] | null} RGB values as an array, or null if invalid.
     */
    hexToRgb: function (hexString, logErrors = true) {
        if (!hexString) return null;
        if (hexString.length == 3) {
            // convert 3-digit hex to 6-digit hex ("rgb" -> "rrggbb")
            hexString = hexString.split('').map(c => c + c).join('');
        }

        // ensure it's a valid hex color code
        if (!/^([\da-fA-F]{6})$/.test(hexString)) {
            if (logErrors)
                console.warn(`Invalid hex color format: ${hexString}. Use rrggbb format.`);
            return null;
        }

        return [
            parseInt(hexString.slice(0, 2), 16),
            parseInt(hexString.slice(2, 4), 16),
            parseInt(hexString.slice(4, 6), 16)
        ];
    },

    /**
     * Converts a color byte array to the hex string representation including the hash.
     * E.g. [1, 255, 8] => '#01ff08'
     * @param {byte[]} rgb 
     * @param {boolean} prependHash if true (default) a hash char is prepended to the output string.
     * @returns {string} hex string
     */
    rgbToHexString: function (rgb, prependHash = true) {
        if (!rgb || rgb.length != 3) return null;
        return (prependHash ? '#' : '') + rgb.reduce((result, color) => result + color.toString(16).padStart(2, '0'), '');
    },

    /**
     * Converts an rgb array to a comma separated string, used for the --rgb variables.
     * @param {byte[]} rgb
     * @returns {string} 
     */
    rgbArrayToRgbCsvString: function (rgb) {
        if (!rgb) return '';
        return `${rgb[0]},${rgb[1]},${rgb[2]}`
    },

    hsvToRgb: function ([h, s, v]) {
        let f = (n) => {
            let k = (n + h / 60) % 6;
            return Math.round(v * (1 - s * Math.max(Math.min(k, 4 - k, 1), 0)) * 255);
        };
        s /= 100;
        v /= 100;
        return [f(5), f(3), f(1)];
    },

    /**
     * h [0,360], s [0,100], l [0,100]
     */
    hslToRgb: function ([h, s, l]) {
        let f = (n) => {
            let k = (n + h / 30) % 12;
            return Math.round((l - s * Math.min(l, 1 - l) * Math.max(Math.min(k - 3, 9 - k, 1), -1)) * 255);
        };
        s /= 100;
        l /= 100;
        return [f(0), f(8), f(4)];
    },

    /**
     * Converts an rgb color to its hsv and hsl components, the hue is the same and ommited for hsl.
     * @param {number[]} rgb rgb channels, each in range 0-255.
     * @returns {number[]} color components in array: [hue, saturation_hsv, value, saturation_hsl, lightness].
     */
    rgbToHsvSl: function ([r, g, b]) {
        r /= 255;
        g /= 255;
        b /= 255;
        let max = Math.max(r, g, b),
            min = Math.min(r, g, b),
            d = max - min,
            h,
            s = max === 0 ? 0 : d / max,
            v = max;

        switch (max) {
            case min:
                h = 0;
                break;
            case r:
                h = (60 * (g - b) / d + 360) % 360;
                break;
            case g:
                h = (60 * (b - r) / d + 120) % 360;
                break;
            case b:
                h = (60 * (r - g) / d + 240) % 360;
                break;
        }

        return [
            Math.round(h),
            Math.round(s * 100),
            Math.round(v * 100),
            Math.round(max == min ? 0 : 100 * d / (1 - Math.abs(max + min - 1))),
            Math.round((max + min) * 50)
        ];
    },

    /**
     * Mixes colors using specified relative fractions. If no fractions given, the colors are mixed with equal parts.
     * @param {number[][]} rgbColors 
     * @param {number[]?} mixFractions 
     * @returns 
     */
    mixColors: function (rgbColors, mixFractions) {
        if (!rgbColors) return [0, 0, 0];
        const mixedColor = [0, 0, 0];
        let weightingSum = 0;

        for (let i = 0; i < rgbColors.length; i++) {
            const weight = mixFractions?.[i] ?? 1;
            if (weight <= 0) continue;
            const addColorRgb = rgbColors[i];
            if (!addColorRgb) continue;
            weightingSum += weight;
            mixedColor[0] += addColorRgb[0] * weight;
            mixedColor[1] += addColorRgb[1] * weight;
            mixedColor[2] += addColorRgb[2] * weight;
        }
        if (weightingSum == 0) return [0, 0, 0];
        mixedColor[0] = Math.round(mixedColor[0] / weightingSum);
        mixedColor[1] = Math.round(mixedColor[1] / weightingSum);
        mixedColor[2] = Math.round(mixedColor[2] / weightingSum);

        return mixedColor;
    },

    /**
     * Inverse of the color.
     * @param {number[]} rgb 
     */
    invertedColor: function (rgb) {
        if (!rgb) return null;
        return [255 - rgb[0], 255 - rgb[1], 255 - rgb[2]];
    },

    /**
     * Inverts a color gradually, 1: inverse, 0: no change.
     * @param {number[]} rgb 
     * @param {number} amount
     * @returns {number[] | null} gradually inverted rgb
     */
    invert: function (rgb, amount = 1) {
        if (!rgb) return null;
        amount = Math.max(0, Math.min(1, amount));
        if (amount == 0) return rgb;
        if (amount == 1) return this.invertedColor(rgb);
        return [
            Math.round(rgb[0] + amount * (255 - 2 * rgb[0])),
            Math.round(rgb[1] + amount * (255 - 2 * rgb[1])),
            Math.round(rgb[2] + amount * (255 - 2 * rgb[2]))
        ];
    },

    /**
     * Hue rotation of color using hsl transformation.
     * @param {number[]} rgb 
     * @param {number} hueRotate in deg, full circle is 360.
     */
    hueRotate: function (rgb, hueRotate) {
        if (!rgb) return null;
        if (!hueRotate) return rgb;
        const hsvsl = this.rgbToHsvSl(rgb);
        return this.hslToRgb([hsvsl[0] + hueRotate, hsvsl[3], hsvsl[4]]);
    },

    /**
     * Change hsl parameters of color.
     * @param {number[]} rgb 
     * @param {number} hueRotate in deg, full circle is 360
     * @param {number} saturationFactor 0: no saturation, 1: no change, >1: more saturation
     * @param {number} lightnessFactor 0: black, 1: no change, >1: lighter
     */
    adjustHsl: function (rgb, hueRotate = 0, saturationFactor = 1, lightnessFactor = 1) {
        if (!rgb) return null;
        const hsvsl = this.rgbToHsvSl(rgb);
        return this.hslToRgb([
            hsvsl[0] + (hueRotate ?? 0),
            saturationFactor === undefined ? hsvsl[3] : Math.min(100, Math.max(0, hsvsl[3] * saturationFactor)),
            lightnessFactor === undefined ? hsvsl[4] : Math.min(100, Math.max(0, hsvsl[4] * lightnessFactor))
        ]);
    },

    /**
     * Inverse lightness of the color.
     * @param {number[]} rgb 
     */
    inverseLightnessOfColor: function (rgb) {
        if (!rgb) return null;
        const hsvsl = this.rgbToHsvSl(rgb);
        return this.hslToRgb([hsvsl[0], hsvsl[3], 100 - hsvsl[4]]);
    },

    /**
     * Inverse relative luminance of the color.
     * @param {number[]} rgb 
     */
    inverseLuminanceOfColor: function (rgb) {
        if (!rgb) return null;
        return this.setRelativeLuminance(rgb, 1 - this.relativeLuminance(rgb));
    },

    /**
     * Returns true if the first 3 elements of the arrays are equal.
     * @param {number[]} rgb1 
     * @param {number[]} rgb2
     */
    rgbEqual: function (rgb1, rgb2) {
        if (!rgb1 && !rgb2) return true;
        if (!rgb1 || !rgb2) return false;
        return rgb1[0] == rgb2[0]
            && rgb1[1] == rgb2[1]
            && rgb1[2] == rgb2[2];
    },
    //#endregion

    //#region theme functions
    /**
     * parses the base variable values for set views and themes
     */
    parseBaseThemes: function () {
        const stylesheets = [...document.styleSheets];

        for (const sheet of stylesheets) {
            try {
                for (const rule of sheet.cssRules) {
                    if (!rule.selectorText) continue;
                    const selectors = rule.selectorText.split(',');

                    selectors.forEach((s) => {
                        let selectorName = s.trim();
                        if (!selectorName
                            || (selectorName != ":root"
                                && selectorName != ".view-light"
                                && selectorName != ".view-dark"
                                && !selectorName.startsWith('.theme-'))
                        ) return;

                        selectorName = selectorName.substring(1);
                        if (!this.baseCss.has(selectorName))
                            this.baseCss.set(selectorName, new Map());
                        const ruleProperties = this.baseCss.get(selectorName);

                        const ruleCount = rule.style.length;
                        for (let i = 0; i < ruleCount; i++) {
                            const propName = rule.style[i];
                            if (propName.startsWith('--wiki')) {
                                ruleProperties.set(propName, rule.style.getPropertyValue(propName).trim());
                            }
                        }
                    });
                }
            } catch (e) {
                console.warn("can't access stylesheet:", e);
            }
        }

        // manual overrides for indirectly defined mix colors
        ['root', 'view-light', 'view-dark'].forEach(viewName => {
            const styles = this.baseCss.get(viewName);
            if (!styles) return;
            styles.set('--wiki-content-text-mix-color', 'color-mix(in srgb, var(--wiki-content-text-color), var(--wiki-content-background-color))');
            styles.set('--wiki-content-text-mix-color-95', 'color-mix(in srgb, var(--wiki-content-text-color) 5%, var(--wiki-content-background-color) 95%)');
        });
        // manual overrider end

        // use view-light and view-dark as base, apply missing root variables
        const rootStyles = this.baseCss.get('root');
        const viewLight = this.baseCss.get('view-light');
        const viewDark = this.baseCss.get('view-dark');
        rootStyles.forEach((v, k) => {
            if (viewLight && !viewLight.has(k)) {
                viewLight.set(k, v);
            }
            if (viewDark && !viewDark.has(k)) {
                viewDark.set(k, v);
            }
        })
    },

    /**
     * Adds an option entry to the select element for each theme.
     */
    addThemesToSelector: function () {
        this.baseCss.forEach((_, k) => {
            const o = document.createElement('option');
            o.value = o.innerHTML = k;
            this.themeBaseSelector.appendChild(o);
        });
    },

    /**
     * Sets all variables to the values of a preset theme.
     * @param {string} themeName 
     */
    applyTheme: function (themeName) {
        if (!this.initialBackgroundDefinition) {
            this.initialBackgroundDefinition = document.body.style.backgroundImage;
        }

        // first set light or dark base values
        if (themeName != 'root' && themeName != 'view-light' && themeName != 'view-dark')
            this.applyTheme(this.themeBaseDark ? 'view-dark' : 'view-light'); // view-light is equal to root

        if (!themeName) return;
        //console.log(`applying variable values of theme: ${themeName}`);
        const theme = this.baseCss.get(themeName);
        if (!theme) {
            console.warn(`ERROR: no theme with name "${themeName}" found to apply.`);
            return;
        }
        const setAsBaseValues = themeName === 'root' || themeName === 'view-light' || themeName === 'view-dark';
        theme.forEach((v, k) => {
            this.variableInfo.get(k)?.setValue(v, setAsBaseValues);
        });

        // apply initial definition for the background in the case it's changed in this theme
        document.body.style.backgroundImage = this.initialBackgroundDefinition;
        const bg = getComputedStyle(document.body)?.backgroundImage;
        this.setBackgroundImageExplicitly(window, bg);
        this.previewPopups?.forEach((p) => { this.setBackgroundImageExplicitly(p, bg); });
    },

    /**
     * Applies the base values of a view. This has an effect on if a variable is saved or not, if it's equal to its base.
     * @param {string} viewName view-light or view-dark
     */
    applyBaseTheme: function (viewName) {
        if (viewName != 'view-light' && viewName != 'view-dark') return;
        const theme = this.baseCss.get(viewName);
        if (!theme) {
            console.warn(`ERROR: no view with name "${viewName}" found to apply.`);
            return;
        }

        theme.forEach((v, k) => {
            this.variableInfo.get(k)?.setBaseValue(v);
        });

        // apply initial definition for the background in the case it's changed in this theme
        document.body.style.backgroundImage = this.initialBackgroundDefinition;
        const bg = getComputedStyle(document.body)?.backgroundImage;
        this.setBackgroundImageExplicitly(window, bg);
    },

    /**
     * Set the background-image property of the body element explicitly to its calculated value.
     * Usually the background-image is set via a variable (e.g. --wiki-body-background-image).
     * Setting the value explicitly will prevent flickering of the background-image if color variables are adjusted in a high frequency and a preview window is opened.
     * @param {window} win 
     * @param {string} backgroundStyle 
     */
    setBackgroundImageExplicitly: function (win, backgroundStyle) {
        if (backgroundStyle)
            win.document.body.style.backgroundImage = backgroundStyle;
    },

    invertAllLightness: function (useLuminance = false) {
        if (useLuminance)
            this.variableInfo.forEach((v) => {
                if (!v.useIndirectDefinition)
                    v.setColor(this.inverseLuminanceOfColor(v.rgb));
            });
        else
            this.variableInfo.forEach((v) => {
                if (!v.useIndirectDefinition)
                    v.setColor(this.inverseLightnessOfColor(v.rgb));
            });
    },

    importStyles: function (useLightView) {
        const varMatches = Array.from(this.inOutTextarea.value.matchAll(/(--[\-\w]+)\s*:\s*([^;]+)\s*;(?:[ \t]*\/\*[ \t]*\{([^\}]+)\}[ \t]*\*\/)?/g));
        if (varMatches.length == 0) {
            console.warn(`couldn't import, no variable definitions found in the input\n${this.inOutTextarea.value}`);
            return;
        }
        if (useLightView) this.applyTheme('view-light');
        else this.applyTheme('view-dark');
        varMatches.forEach((m) => {
            const varInfo = this.variableInfo.get(m[1]);
            if (!varInfo) {
                if (!m[1].endsWith('--rgb'))
                    console.log(`var ${m[1]} not found in given variables, couldn't apply value`);
                return;
            }

            varInfo.setValue(m[2]);

            if (m[3]) {
                const optionMatches = Array.from(m[3].matchAll(/(saveExplicitRgbInOutput|invert|hueRotate|saturationFactor|lightnessFactor) *: *(\d+(?:\.\d+)?)/g));
                if (optionMatches.length > 0) {

                    // first set to default
                    const options = new Map();
                    options.set('saveExplicitRgbInOutput', false);
                    options.set('optionInvert', false);
                    options.set('optionHueRotate', 0);
                    options.set('optionSaturationFactor', 1);
                    options.set('optionLightnessFactor', 1);

                    optionMatches.forEach(optionMatch => {

                        switch (optionMatch[1]) {
                            case 'saveExplicitRgbInOutput':
                                options.set('saveExplicitRgbInOutput', !!optionMatch[2]);
                                break;
                            case 'invert':
                                options.set('optionInvert', !!optionMatch[2]);
                                break;
                            case 'hueRotate':
                                options.set('optionHueRotate', parseFloat(optionMatch[2]) ?? 0);
                                break;
                            case 'saturationFactor':
                                options.set('optionSaturationFactor', parseFloat(optionMatch[2]) ?? 0);
                                break;
                            case 'lightnessFactor':
                                options.set('optionLightnessFactor', parseFloat(optionMatch[2]) ?? 0);
                                break;
                        }
                    });
                    for (const [option, value] of options) {
                        varInfo[option] = value;
                    }
                }
            }
        });
        // close import textarea
        this.inOutStyleSheetEl.classList.toggle('transition-hide', true);
    },

    /**
     * Exports current styles.
     * @param {boolean} returnText If true the generated style text is returned. If false, the text is displayed in a textarea.
     */
    exportStyles: function (returnText = false) {
        const varDefinitions = [];
        const exportIncludeExplicitOptions = this.exportIncludeExplicitOptions;
        this.variableInfo.forEach((v) => {
            let explicitDefinition = null;
            if (exportIncludeExplicitOptions) {
                const options = [];
                if (v.saveExplicitRgbInOutput) options.push('saveExplicitRgbInOutput: 1');
                if (v.optionInvert !== undefined) options.push('invert: 1');
                if (v.optionHueRotate !== undefined) options.push('hueRotate: ' + v.optionHueRotate);
                if (v.optionSaturationFactor !== undefined) options.push('saturationFactor: ' + v.optionSaturationFactor);
                if (v.optionLightnessFactor !== undefined) options.push('lightnessFactor: ' + v.optionLightnessFactor);

                if (options.length > 0)
                    explicitDefinition = options.join(', ');
            }

            if (!explicitDefinition && !v.valueShouldGoInOutput()) {
                //console.log(`skipping output for var ${v.name}, it's equal to base color`);
                return;
            }
            //console.log(`including ${v.name} in css output: value: ${v.value}, base: ${v.baseValue}, rgb: ${v.rgb}, baseColor: ${v.baseColor}`);
            if (exportIncludeExplicitOptions) {
                // css output for saving theme definition
                varDefinitions.push(`${v.name}: ${v.value};` + (explicitDefinition ? ` /* {${explicitDefinition}} */` : ''));
            } else {
                // css ouput for wiki
                varDefinitions.push(`${v.name}: ${v.defaultVariableStringOutput()};`);
                if (this.exportIncludeRgbVariants && v.hasFormatRgb)
                    varDefinitions.push(`${v.name}--rgb: ${v.valueColorAsCommaRgbString()};`);
                if (v.name == '--wiki-content-link-color') {
                    varDefinitions.push(`--wiki-icon-to-link-filter: ${this.filterCreator.calculateFilter(v.rgb).filterString};`);
                }
            }
        });

        const styleText = varDefinitions.length == 0 ? '/* no variables where different from the base theme, nothing to export. */'
            : '.theme-myThemeName {\n    ' + varDefinitions.join('\n    ') + '\n}\n';

        if (returnText) return styleText;
        this.inOutTextarea.value = styleText;
    },
    //#endregion

    //#region general utils

    roundToDigits: function (val, digits) {
        const power = Math.pow(10, digits);
        return Math.round(val * power) / power;
    },

    /**
     * Throttles a function call, calls after the cooldown again if called during cooldown
     * @param {function} functionToThrottle 
     * @param {number} delay 
     * @returns throttled function
     */
    throttle: function (functionToThrottle, delay = 50) {
        let isInCooldown = false;
        let callAfterThrottle = false;

        return (...args) => {
            if (isInCooldown) {
                callAfterThrottle = true;
                return;
            }
            functionToThrottle(...args);
            isInCooldown = true;
            callAfterThrottle = false;
            setTimeout(nextPossibleCall, delay);
            function nextPossibleCall() {
                if (callAfterThrottle) {
                    callAfterThrottle = false;
                    functionToThrottle(...args);
                    setTimeout(nextPossibleCall, delay);
                    return;
                }
                isInCooldown = false;
            }
        };
    },

    /**
     * Debounces a function, it will only execute when the function was not called for some time.
     * @param {function} functionToDebounce 
     * @param {number} waitFor 
     */
    debounce: function (functionToDebounce, waitFor = 500) {
        let timerId;
        return (...args) => {
            clearTimeout(timerId);
            timerId = setTimeout(() => { functionToDebounce.apply(this, args); }, waitFor);
        }
    },
    //#endregion

    //#region styling, controls
    /**
     * Add css styles used for this tool
     */
    addThemeColorEditorCssStyles: function () {
        const themeColorEditorStyles = document.createElement('style')
        themeColorEditorStyles.innerHTML =
            `.theme-color-editor-control {
    background: rgba(30, 30, 30, 0.8);
    color: #fff;
    border: 1px solid #000;
    padding: 0.2rem;
    margin: 0.3rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    border-radius: 8px;
    z-index: 10;
}

.theme-color-editor-control a{
    color: white;
}

.theme-color-editor-control a:hover{
    color: gray;
}

.theme-color-editor-control pre {
    color:white;
    background-color: black;
    border: unset;
}

.theme-color-editor-close-button {
position:absolute;right:3px;top:3px;width:15px;height:16px;padding-right:1px;text-align:center;background-color:darkred;color:white;border:1px solid red;border-radius:50%;cursor:pointer;
}

.theme-color-editor-color-picker-container {
    position: fixed;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    width: 20rem;
}

.theme-color-editor-warning {
	background-color: yellow;
	border: 1px solid black;
	color: black;
	padding: 0.1em;
	width: 1.8em;
	height: 1.8em;
    font-size: 1.5em;
	text-align: center;
}

.theme-color-editor-var-toc {
    position: fixed;
    top: 3rem;
    left: -30.5rem;
    width: 30rem;
    overflow: scroll;
    min-height: 4rem;
    height: calc(100% - 8rem);
    padding-bottom: 4rem;
    padding-left: 0.5rem;
    transition: left 0.1s linear;
}

.theme-color-editor-var-toc:hover {
    left: -.5rem;
}

.theme-color-editor-var-toc a{
    text-decoration: none;
}

.theme-color-editor-center-popup{
    min-width: 10rem;
    min-height: 10rem;
    position: fixed;
    margin: auto;
    top: 3rem;
    left: 4rem;
}

.theme-color-editor-variable-name-container {
    position: relative;
    vertical-align: top;
}

.theme-color-editor-variable-hidden-settings {
    visibility: hidden;
}

.theme-color-editor-variable-name-container:hover .theme-color-editor-variable-hidden-settings {
    visibility: visible;
}

.theme-color-editor-variable-changed-indicator {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    background: #444;
    border: 1px solid black;
    width: 1em;
    height: 1em;
    border-bottom-right-radius: 100%;
}

.theme-color-editor-button,
.theme-color-editor-toggle-button {
    color: #fff;
    border: 1px solid gray;
    border-radius: 4px;
    background: linear-gradient(to bottom, #333, #111);
    padding: 0px 0.2em 1px;
    margin: 1px 2px;
    cursor: pointer;
    display: block;
    text-align: center;
    text-decoration: none;
    font-size: 0.9em;
    line-height: normal;
}

.theme-color-editor-button-light {
    color: #000;
    background: linear-gradient(to bottom, #ddd, #bbb);
}

a.theme-color-editor-button:visited,
a.theme-color-editor-button:hover{
    color: #fff;
    text-decoration: none;
}

.theme-color-editor-button:active,
.theme-color-editor-toggle-button:has(input:checked) {
    background: linear-gradient(to bottom, #222, #555);
    color: #ffa;
    box-shadow: inset 2px 2px 2px #00000099;
}

.theme-color-editor-toggle-button input {
    display: none;
}

.theme-color-editor-number-label {
	white-space: nowrap;
}

.theme-color-editor-toggle-button {
    background: linear-gradient(to bottom, #542, #321);
    display: inline-block;
}

.theme-color-editor-toggle-button:checked {
    background: linear-gradient(to bottom, #321, #542);
}

.theme-color-editor-button.theme-color-editor-inline {
    display: inline-block;
}

.theme-color-editor-groupbox {
	border-radius: 3px;
	border: 1px solid lightgray;
	padding: 0 1px 1px;
    margin-top: 0.7em;
    box-sizing: border-box;
}

.theme-color-editor-groupbox-heading {
	position: relative;
	top: -0.2em;
	display: table;
	background: #333;
	margin: -0.7em auto 0;
	padding: 0.3em 0.2em;
	line-height: 0.5;
	border: 1px solid lightgray;
	border-radius: 3px;
	font-size: 0.9em;
    color: #c1c1c1;
}

.theme-color-editor-groupbox .theme-color-editor-button.theme-color-editor-full-width,
.theme-color-editor-groupbox .theme-color-editor-toggle-button.theme-color-editor-full-width {
    box-sizing: border-box;
    width: 100%;
    margin-left: 0;
    margin-right: 0;
}

.contrast-color-indirectly-defined{
    background: linear-gradient(to bottom, #b37525, #461e00);
}

.theme-color-editor-toolbar {
    position: fixed;
    bottom: 1rem;
    right: 0.5rem;
    padding: 0.3rem;
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    align-items: flex-end;
    z-index: 5;
}

.theme-color-editor-checkbox-subcontainer {
    margin-left: 1em;
}

.theme-color-editor-checkbox:has(input:not(:checked)) + .theme-color-editor-checkbox-subcontainer {
    display: none;
}

.theme-color-editor-style-text {
    position: fixed;
    top: 50px;
    left: 0;
    min-width: 50px;
    min-height: 50px;
    height: 70%;
    overflow: scroll;
    z-index: 11;
}

.transition-show {
    visibility: visible;
    opacity: 1;
    transition: opacity 0.1s linear, visibility 0s;
}

.transition-hide {
    visibility: hidden;
    opacity: 0;
    transition: opacity 0.1s linear, visibility 0.1s 0s;
}

body {
    margin-bottom: 300px; /* space for color-picker-container when scrolled to the bottom */
}

.color-picker-frame {
    border: 1px solid #797979;
    padding: 0.3rem 0.1rem 0.1rem;
    border-radius: 0.2rem;
}
    
.custom-slider {
    width: 100%;
    appearance: none;
    -webkit-appearance: none;
    border-radius: 1rem;
    height: 0.7rem;
    cursor: pointer;
    margin: 0.5rem 0;
}

/* chrome */
.custom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
    background: var(--custom-slider-background-color, #5cd5eb);
    height: 1.2rem;
    width: 1.2rem;
    border: 2px solid white;
    border-radius: 1rem;
}

/* firefox */
.custom-slider::-moz-range-thumb {
    appearance: none;
    margin-top: -0.95rem;
    background: var(--custom-slider-background-color, #5cd5eb);
    height: 1.2rem;
    width: 1.2rem;
    border: 2px solid white;
    border-radius: 1rem;
}

.custom-slider:focus {
    outline: none;
}

.custom-slider:focus::-webkit-slider-thumb,
.custom-slider:focus::-moz-range-thumb {
    outline: 3px solid #000;
}

.wikitable tr td.selected-color-cell {
    outline: white solid 5px;
    outline-offset: -5px;
    position: relative;
    border-width: 0;
}

.wikitable tr td.selected-color-cell::before {
    outline: black solid 7px;
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
}

.theme-color-editor-contrast-indicator {
    text-align: right;
    padding: 0 0.2rem;
    margin: 2px 4px;
    border: 1px solid #007745;
    background-color: #6cffc2;
    color: #004424;
    border-radius: 4px;
    min-width: 51px;
    display: inline-block;
}

.theme-color-editor-contrast-indicator.insufficient-contrast {
    margin: 0 2px;
    border-color: #c85e00;
    background-color: #ffc02c;
    color: black;
    border-width: 3px;
    min-width: 55px;
}

.theme-color-editor-contrast-indicator.bad-contrast {
    margin: 0 2px;
    border-color: #ff6565;
    background-color: #5b0000;
    color: white;
    border-width: 3px;
    min-width: 55px;
}

.theme-color-editor-contrast-visualizer-circle {
    height: 16px;
    width: 16px;
    border-radius: 50%;
    display: inline-block;
    margin: 0 2px;
    vertical-align: middle;
}

.theme-color-editor-contrast-visualizer-circle .theme-color-editor-contrast-visualizer-circle {
    height: 8px;
    width: 8px;
    margin: 4px;
    vertical-align: top;
}

.theme-color-editor-contrast-visualizer-circle .theme-color-editor-contrast-visualizer-circle .theme-color-editor-contrast-visualizer-circle {
    height: 4px;
    width: 4px;
    margin: 2px;
}

.theme-color-editor-contrast-visualizer-square {
    height: 16px;
    width: 16px;
    display: inline-block;
    margin: 0 2px;
    vertical-align: middle;
}

.theme-color-editor-variable-title {
    font-weight: bold;
    margin-bottom: 0.4em;
}

.theme-color-editor-link-to-var {
    visibility: hidden;
}

.theme-color-editor-link-to-var-wrapper:hover .theme-color-editor-link-to-var {
    visibility: visible;
}

.theme-color-editor-pointer {
    cursor: pointer;
}
`;
        document.body.appendChild(themeColorEditorStyles);
    },

    addToolbar: function () {
        const toolBarElement = document.createElement('div');
        toolBarElement.className = "theme-color-editor-toolbar theme-color-editor-control";
        document.body.appendChild(toolBarElement);

        // adjust global lightness
        const divTools = this.createElementAndAdd('div', 'theme-color-editor-groupbox', toolBarElement);
        this.createElementAndAdd('span', 'theme-color-editor-groupbox-heading', divTools, null, 'global color tools');
        let bt = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-full-width', divTools, 'Inverts the luminance of all colors (switching dark <-> light)\nThe effect might be unexpected.', "invert all color's luminance");
        bt.addEventListener('click', () => { this.invertAllLightness(true) });
        bt = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-full-width', divTools, 'Inverts the lightness of all colors (switching dark <-> light)\nAlso consider to use the "rebase" button to use the according view as base (light / dark).', "invert all color's lightness");
        bt.addEventListener('click', () => { this.invertAllLightness() });

        // theme loader
        const divThemeSelector = this.createElementAndAdd('div', 'theme-color-editor-groupbox', toolBarElement);
        this.createElementAndAdd('span', 'theme-color-editor-groupbox-heading', divThemeSelector, null, 'themes');
        divThemeSelector.appendChild(this.createCheckbox('view-light',
            (e) => { this.themeBaseDark = e.target.checked; e.target.nextSibling.nodeValue = e.target.checked ? 'view-dark' : 'view-light'; },
            'view the theme is based on', true));
        this.themeBaseSelector = this.createElementAndAdd('select', null, divThemeSelector);
        bt = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-full-width', divThemeSelector, 'Sets all variables to the values of a preset view (light/dark) and theme.', 'load theme variables');
        bt.addEventListener('click', () => { this.applyTheme(this.themeBaseSelector.options[this.themeBaseSelector.selectedIndex].text); });
        bt = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-full-width', divThemeSelector,
            'Sets all base values of the variables to the selected view (light or dark).\nThis has an effect whether a variable will be in the output or not (variables equal to their base value of the view won\'t be included)',
            'rebase variables');
        bt.addEventListener('click', () => { this.applyBaseTheme(this.themeBaseDark ? 'view-dark' : 'view-light'); });

        // import export
        const divImportExport = this.createElementAndAdd('div', 'theme-color-editor-groupbox', toolBarElement);
        this.createElementAndAdd('span', 'theme-color-editor-groupbox-heading', divImportExport, null, 'import/export css');
        divImportExport.appendChild(this.createCheckbox('include --rgb',
            (e) => { this.exportIncludeRgbVariants = e.target.checked; },
            'Include --rgb color variables for variables that have them.'));
        divImportExport.appendChild(this.createCheckbox('include explicit adjustments',
            (e) => { this.exportIncludeExplicitOptions = e.target.checked; },
            'Include color options set for explicit color adjustments (e.g. invert, hue-rotate).\nThis should be only enabled if you want to save your work and import later.\nThis should not be enabled to export the css for use on a wiki.'));
        const inOutButton = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-full-width', divImportExport, null, 'input output view toggle');
        inOutButton.addEventListener('click', () => { this.inOutStyleSheetEl.classList.toggle('transition-hide'); });
        bt = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-full-width', divImportExport, null, 'copy styles to clipboard');
        bt.addEventListener('click', () => { navigator.clipboard.writeText(this.exportStyles(true)); });
        // in out element
        this.inOutStyleSheetEl = this.createElementAndAdd('div', 'theme-color-editor-control theme-color-editor-center-popup transition-show transition-hide', document.body);
        this.createElementAndAdd('div', null, this.inOutStyleSheetEl, null, 'css import/export');
        bt = this.createElementAndAdd('div', 'theme-color-editor-close-button', this.inOutStyleSheetEl, null, '×');
        bt.addEventListener('click', (e) => { e.target.parentElement.classList.toggle("transition-hide", true) });
        this.inOutTextarea = this.createElementAndAdd('textarea', null, this.inOutStyleSheetEl, null, null, { 'rows': '20', 'cols': '106' });
        const buttonContainer = this.createElementAndAdd('div', null, this.inOutStyleSheetEl);
        const btImportLight = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-button-light theme-color-editor-inline', buttonContainer, null, '↷import with light-view as base');
        btImportLight.addEventListener('click', () => this.importStyles(true));
        const btImportDark = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-inline', buttonContainer, null, '↷import with dark-view as base');
        btImportDark.addEventListener('click', () => this.importStyles(false));
        const btExport = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-inline', buttonContainer, null, '⮍replace text above with current theme definitions');
        btExport.addEventListener('click', () => this.exportStyles());

        // live preview controls
        const divPreview = this.createElementAndAdd('div', 'theme-color-editor-groupbox', toolBarElement);
        this.createElementAndAdd('span', 'theme-color-editor-groupbox-heading', divPreview, null, 'live preview');
        const previewPageEl = this.createElementAndAdd('input', null, divPreview, 'Enter the name of a wiki page for a live preview of the set colors\nE.g. "Wood", "Main Page" or "Wood?diff=prev&oldid=6699"', 'preview', {
            'type': 'text', 'placeholder': 'Wiki page name', 'id': 'theme-color-editor-preview-page-name',
            'value': localStorage.getItem('theme-color-editor-preview-page-name') ?? ''
        });
        previewPageEl.addEventListener('keyup', (e) => {
            if (e.key === "Enter") this.openPreviewWindow();
        });
        bt = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-full-width', divPreview, null, "preview popup");
        bt.addEventListener('click', () => { this.openPreviewWindow(); });
        bt = this.createElementAndAdd('button', 'theme-color-editor-button', divPreview, "set default popup location", 'save loc');
        bt.addEventListener('click', this.saveDefaultPopupLocation);
    },
    //#endregion

    /**
     * Contains info about a css variable.
     */
    VariableInfo: class {
        constructor(varName) {
            this.name = varName;
        }

        name;

        /**
         * Value of this variable, e.g. an explicit color or reference to another variable.
         */
        value;

        /**
         * The current explicit color of this variable in a number[], each channel as byte in the range [0,255].
         */
        rgb;

        /**
         * If true there's also a variable variant with the output as decimal numbers separated by a comma, e.g. '10,255,8'.
         * When saving this variable another var with that info is saved suffixed with --rgb
         */
        hasFormatRgb;

        /**
         * Base color (number[], rgb) if theme variable is not set.
         */
        baseColor;

        /**
         * Base value if this theme variable is not set.
         * Before saving, check if the set value is equal to this,
         * then optionally don't save the variable at all since it's redundant in the context.
         */
        baseValue;

        /**
         * Indirect definition of this variable in a string, e.g. equal to other color like 'var(--other-var)' or mix 'color-mix(in srgb, #123, #f00)'
         */
        #indirectDefinition;

        /**
         * Enables the indirect definition given in this.#dependsOnVarsEl.value, or disables it (without deleting the string value).
         * @param {boolean} enable
         */
        enableIndirectDefinition(enable) {
            if (enable) {
                this.colorExplicitEl.style.backgroundColor = this.#dependsOnVarsEl.value;
            } else {
                this.colorExplicitEl.style.backgroundColor = '';
            }
            this.colorChangedThrottled(this);
        }

        /**
         * Sets the value of the indirect definition, e.g. another variable.
         * @param {string} v
         * @param {boolean} alsoSetAsBase 
         */
        setIndirectDefition(v, alsoSetAsBase = false) {
            this.#indirectDefinition = v;
            this.#dependsOnVarsEl.value = v ?? '';
            this.useIndirectDefinition = !!v;
            if (v)
                this.setColor(this.getCalculatedColorRgb(), alsoSetAsBase, true);
        }

        /**
         * updates the variables this variable depends on. Call after changing indirectDefinitions.
         */
        updateDependencyVariables() {
            if (!this.#indirectDefinition || !this.useIndirectDefinition) {
                this.dependsOnVars = null;
                return;
            }

            const variables = [];
            const variableNameMatches = this.#indirectDefinition.match(/(?<=var\()--[\w\-]+(?=\))/g);
            variableNameMatches?.forEach((vn) => {
                const varInfo = themeColorEditor.variableInfo.get(vn);
                if (varInfo)
                    variables.push(varInfo);
            });

            this.dependsOnVars = variables.length > 0 ? variables : null;
        }

        /**
         * Array of variables this one depends on, i.e. the variables that appear in this.#indirectDefinition
         */
        #dependsOnVars;

        /**
         * Array of variables this one depends on.
         */
        set dependsOnVars(v) {
            let removeDependsOnVars = this.#dependsOnVars ? [...this.#dependsOnVars] : null;

            if (!v) this.#dependsOnVars = null;
            else {
                this.#dependsOnVars = [...v];
                this.#dependsOnVars.forEach((sourceVar) => {
                    if (!sourceVar.affectsVars) sourceVar.affectsVars = [this];
                    else if (!sourceVar.affectsVars.includes(this)) sourceVar.affectsVars.push(this);
                });
            }

            if (this.#dependsOnVars)
                removeDependsOnVars = removeDependsOnVars?.filter((v) => !this.#dependsOnVars.includes(v));
            removeDependsOnVars?.forEach((v) => {
                v.affectsVars = v.affectsVars?.filter((sv) => sv != this);
            });
        }

        /**
         * Array of variables this one depends on.
         */
        get dependsOnVars() { return this.#dependsOnVars; }

        /**
         * Text input for indirect color definition.
         */
        #dependsOnVarsEl;

        setDependsOnVarsElement(indirectDefinitionEl) {
            this.#dependsOnVarsEl = indirectDefinitionEl;
            indirectDefinitionEl.addEventListener('change', (e) => { this.setValue(e.target.value); });
        }

        /**
         * Element where the color is shown.
         */
        colorDisplayEl;

        /**
         * Element where the indirectly set color is set by other variables, used to further calculate indirect colors, invisible to the user.
         */
        colorExplicitEl;

        /**
         * Calculate the color if defined indirectly without effects of color options (e.g. invert, hue-rotate).
         */
        getCalculatedColorRgb() {
            let computedRgb = themeColorEditor.parseColor(window.getComputedStyle(this.colorExplicitEl).backgroundColor);
            if (!this.saveExplicitRgbInOutput) return computedRgb;
            if (this.optionInvert) computedRgb = themeColorEditor.invertedColor(computedRgb);
            if (this.optionHueRotate === undefined && this.optionSaturationFactor === undefined && this.optionLightnessFactor === undefined)
                return computedRgb;
            return themeColorEditor.adjustHsl(computedRgb, this.optionHueRotate, this.optionSaturationFactor, this.optionLightnessFactor);
        }

        /**
         * Array of variable this variable affects.
         */
        affectsVars;

        /**
         * Array of variables this variable needs to have a specific contrast to.
         */
        contrastVariables;

        /**
         * List of other color contrast variables where this color is checked for contrast.
         * This is used to update the contrast checkers on these rows when this color is changed.
         */
        ContrastVariableOfOtherColors;

        /**
         * Element that shows if this color is different from the base definition
         */
        elementEqualToBaseColor;

        /**
         * button to reset this color to the base definition
         */
        elementResetToBaseColor;

        /**
         * 
         * @returns {boolean} true if the color is different from the base value and should be saved in the output
         */
        valueShouldGoInOutput() {
            return (this.saveExplicitRgbInOutput || !this.useIndirectDefinition || !this.value || this.value != this.baseValue)
                && !themeColorEditor.rgbEqual(this.rgb, this.baseColor);
        }

        /**
         * Callback to create the default variable value.
         */
        defaultVariableStringOutput = () => {
            //console.log(`string output for ${this.name}: expl: ${this.saveExplicitRgbInOutput}, val: ${this.value}`);
            return this.useIndirectDefinition && !this.saveExplicitRgbInOutput ? this.value : this.valueColorAsHexString();
        }

        /**
         * Output of this color variable in the hex format #rrggbb
         */
        valueColorAsHexString() {
            return themeColorEditor.rgbToHexString(this.rgb);
        }

        /**
         * * Output of this variable in the decimal format r,g,b
         */
        valueColorAsCommaRgbString() {
            return themeColorEditor.rgbArrayToRgbCsvString(this.rgb);
        }

        /**
         * Custom callback if the color is changed, e.g. to check specific properties of the value.
         */
        customOnChangeFunction;

        /**
         * Updates the variables dependent on this one. The page style needs to be set already.
         */
        updateAffectedColors() {
            if (!this.affectsVars) return;
            this.affectsVars.forEach((v) => {
                v.updateValueFromAffectors();
            });
        }

        /**
         * Call this function if the color is defined indirectly and possibly changed,
         * e.g. the source variables changed or the options that affect the explicit color (e.g. hue-rot, saturation-factor).
         */
        updateValueFromAffectors() {
            if (!this.useIndirectDefinition || !this.#dependsOnVars) return;
            //console.log(`updating ${this.name} from affectors: use indirect: ${this.useIndirectDefinition}, depends on: ${this.#dependsOnVars}`);
            this.setColor(this.getCalculatedColorRgb(), false, null);
        }

        resetToBase() {
            this.setValue(this.baseValue);
        }

        /**
         * Sets the value of this variable.
         * @param {string} value 
         * @param {boolean} alsoSetAsBaseValue 
         */
        setValue(value, alsoSetAsBaseValue = false) {
            this.value = value;
            if (alsoSetAsBaseValue)
                this.baseValue = value;

            const parsedRgb = value && !value.includes('var') ? themeColorEditor.parseColor(value) : null;
            if (parsedRgb) {
                this.setColor(parsedRgb, alsoSetAsBaseValue);
            } else {
                // color is set indirectly
                this.setIndirectDefition(value, alsoSetAsBaseValue);
            }
        }

        /**
         * Sets the color of this variable and update affected colors and visuals.
         * @param {number[]} rgb 
         * @param {boolean} alsoSetAsBase If true the base color is also set to the value of rgb.
         * @param {boolean | null} useIndirectDefinition If true or false, the property useIndirectDefinition is set to that.
         */
        setColor(rgb, alsoSetAsBase = false, useIndirectDefinition = false) {
            if (alsoSetAsBase)
                this.baseColor = [...rgb];
            if (useIndirectDefinition === true || useIndirectDefinition === false)
                this.useIndirectDefinition = useIndirectDefinition;

            if (!!themeColorEditor.rgbEqual(this.rgb, rgb)) {
                if (alsoSetAsBase)
                    this.updateIndicatorForAdjustedColor(alsoSetAsBase);
                return;
            }

            this.rgb = [...rgb];
            this.updateIndicatorForAdjustedColor(alsoSetAsBase);
            this.colorChangedThrottled(this);
        }

        /**
         * Only sets the base value without changing the color. This has an effect on if a variable is saved in a theme if its value is different from the base value.
         * @param {string} baseValue 
         */
        setBaseValue(baseValue) {
            if (this.baseValue == baseValue) return;

            const parsedRgb = baseValue && !baseValue.includes('var') ? themeColorEditor.parseColor(baseValue) : null;
            this.baseValue = baseValue;
            if (parsedRgb) {
                this.baseColor = parsedRgb;
            } else {
                // color is set indirectly
                this.colorExplicitEl.style.backgroundColor = baseValue;
                this.baseColor = this.getCalculatedColorRgb();
            }

            this.updateIndicatorForAdjustedColor();
        }

        colorChangedThrottled = themeColorEditor.throttle(this.colorChanged, 20);

        colorChanged(variable) {
            themeColorEditor.updateVariableOnPage(variable);
            if (variable.customOnChangeFunction)
                variable.customOnChangeFunction();
            variable.updateAffectedColors();
        }

        updateIndicatorForAdjustedColor(colorIsEqualToBase = undefined) {
            const colorEqualToBase = colorIsEqualToBase === true || !this.valueShouldGoInOutput();
            if (colorEqualToBase) {
                this.elementEqualToBaseColor.style.backgroundColor = '';
                this.elementEqualToBaseColor.title = `This color is equal to the base style.\nThe variable will not be included in the output.\nThis color: rgb(${this.rgb}), ${themeColorEditor.rgbToHexString(this.rgb)}`;
            } else {
                this.elementEqualToBaseColor.style.backgroundColor = '#ffff41';
                this.elementEqualToBaseColor.title = `This color is different to the base style.\nThe variable will be included in the output.\nThis color: rgb(${this.rgb}), ${themeColorEditor.rgbToHexString(this.rgb)}\nBase color: rgb(${this.baseColor}), ${themeColorEditor.rgbToHexString(this.baseColor)}`;
            }

            this.elementResetToBaseColor.style.visibility = colorEqualToBase ? 'hidden' : 'visible';
        }
    },

    /**
     * Representing a contrast color in a color row with needed min contrast to row color.
     */
    ContrastVariableInfo: class {
        variableName;
        variable;
        /**
         * The color the contrast is calculated to (i.e. the main color of the row)
         */
        contrastColorRgb;
        contrast;
        contrastDisplayElement;
        minContrast;
        elementResetToBaseColor;

        constructor(variableName, contrastDisplayElement) {
            // simulate two different constructors by checking the types
            if (typeof variableName === 'string' && typeof contrastDisplayElement === 'object') {
                // if constructor is called with variableName:string and contrastDisplayElement:HTMLElement
                this.variableName = variableName;
                this.contrastDisplayElement = contrastDisplayElement;
            }
            else if (typeof variableName === 'object' && typeof contrastDisplayElement === 'number') {
                // if constructor is called with variable:VariableInfo and minContrast:number
                this.variable = variableName;
                this.minContrast = contrastDisplayElement;
            }
        }

        /**
         * Updates the contrast value and display.
         * If rgb is given, the base color is updated
         * @param {number[]?} rgb 
         * @returns 
         */
        UpdateContrast(rgb = null) {
            if (!this.variable) return;
            if (rgb) {
                this.contrastColorRgb = [...rgb];
            }
            this.contrast = themeColorEditor.colorContrast(this.variable.rgb, this.contrastColorRgb);
            if (this.contrast === undefined || this.contrastDisplayElement === null) return;
            this.contrastDisplayElement.innerHTML = (Math.floor(this.contrast * 10) / 10) + '<small>:1</small>';
            const sufficientContrast = this.contrast >= this.minContrast;
            if (sufficientContrast) {
                this.contrastDisplayElement.classList.toggle('bad-contrast', false);
                this.contrastDisplayElement.classList.toggle('insufficient-contrast', false);
            } else if (this.contrast >= this.minContrast * 0.8) {
                this.contrastDisplayElement.classList.toggle('bad-contrast', false);
                this.contrastDisplayElement.classList.toggle('insufficient-contrast', true);
            }
            else {
                this.contrastDisplayElement.classList.toggle('bad-contrast', true);
                this.contrastDisplayElement.classList.toggle('insufficient-contrast', false);
            }
            this.contrastDisplayElement.setAttribute('title', (sufficientContrast ? 'sufficient contrast' : 'contrast not sufficient') + `, needed contrast is at least ${this.minContrast}:1`);

            const buttonFixContrast = this.contrastDisplayElement.nextSibling;
            buttonFixContrast.style.visibility = sufficientContrast ? 'hidden' : 'visible';
            buttonFixContrast.classList.toggle('contrast-color-indirectly-defined', this.variable.useIndirectDefinition);
            buttonFixContrast.setAttribute('title', 'Tries to fix the contrast issues by changing the lightness of the variable ' + this.variable.name + (this.variable.useIndirectDefinition ? '\nCaution! This variable is indirectly defined. Using this button will save the color explicitly.' : ''));

            this.elementResetToBaseColor.style.visibility = themeColorEditor.rgbEqual(this.variable.rgb, this.variable.baseColor) ? 'hidden' : 'visible';
        }
    },

    ColorPicker: class {
        rgb = [];
        hsvSl = []; // [h, s_hsv, v, s_hsl, l]
        #container;

        #colorPreviewEl;
        #hSlider;
        #sHsvSlider;
        #vSlider;
        #sHslSlider;
        #lSlider;
        #rSlider;
        #gSlider;
        #bSlider;
        #hInput;
        #sHsvInput;
        #vInput;
        #sHslInput;
        #lInput;
        #rInput;
        #gInput;
        #bInput;
        #titleText;
        #hexInputEl;
        #currentColorVariable;
        get currentColorVariable() { return this.#currentColorVariable; }

        constructor(elementToAppend) {
            this.#container = document.createElement('div');
            this.#container.className = 'theme-color-editor-color-picker-container theme-color-editor-control transition-show transition-hide';

            let bt = themeColorEditor.createElementAndAdd('div', 'theme-color-editor-close-button', this.#container, null, '×');
            bt.addEventListener('click', () => { themeColorEditor.editColorInColorPicker(null) });
            this.#titleText = themeColorEditor.createElementAndAdd('div', null, this.#container, null, null, { 'id': 'color-picker-title' }, 'margin: 0.4rem;');
            this.#colorPreviewEl = themeColorEditor.createElementAndAdd('div', null, this.#container, null, null, { 'id': 'color-preview' }, 'height: 50px; border: 1px solid #000; border-radius: 5px;');

            // hex input and slider toggle
            const hexFrame = themeColorEditor.createElementAndAdd('div', 'color-picker-frame', this.#container);
            const lbHexInput = themeColorEditor.createElementAndAdd('label', null, hexFrame, null, '# ');
            this.#hexInputEl = themeColorEditor.createElementAndAdd('input', null, lbHexInput, null, null, { 'type': 'text', 'pattern': '[\\da-fA-F]{3,6}', 'minlength': '3', 'maxlength': '6', 'size': '6' });
            this.#hexInputEl.addEventListener('input', (e) => this.setColorAndSetControls(themeColorEditor.hexToRgb(e.target.value, false)));

            // view toggle checkboxes
            function addSliderToggleCheckBox(name, sliderIds) {
                const lb = themeColorEditor.createCheckbox(name,
                    function () {
                        ids?.forEach((id) => {
                            let el = document.getElementById('theme-creator-color-picker-slider-' + id);
                            if (el) el.style.display = this.checked ? 'block' : 'none';
                            if (this.checked)
                                localStorage.removeItem('theme-creator-hide-color-slide-' + name);
                            else
                                localStorage.setItem('theme-creator-hide-color-slide-' + name, true);
                        });
                    }, null, true);
                lb.style.display = 'inline-block';
                const ids = [...sliderIds];
                if (!localStorage.getItem('theme-creator-hide-color-slide-' + name))
                    setTimeout(() => {
                        lb.click();
                    }, 500);

                hexFrame.appendChild(lb);
            }

            addSliderToggleCheckBox('hsv', ['s_hsv', 'v']);
            addSliderToggleCheckBox('hsl', ['s_hsl', 'l']);
            addSliderToggleCheckBox('rgb', ['r', 'g', 'b']);

            // slider
            function addColorSlider(container, name, id, updateCallback, max, min = 0, styleRange = null) {
                const cpFrame = themeColorEditor.createElementAndAdd('div', 'color-picker-frame', container, null, null, { 'id': 'theme-creator-color-picker-slider-' + id }, "display: " + (name == "Hue" ? "block" : "none"));
                themeColorEditor.createElementAndAdd('label', null, cpFrame, null, name);
                const inputEl = themeColorEditor.createElementAndAdd('input', null, cpFrame, null, null, { 'type': 'number', 'min': min, 'max': max }, 'float: right;');
                const rangeEl = themeColorEditor.createElementAndAdd('input', 'custom-slider', cpFrame, null, null, { 'type': 'range', 'min': min, 'max': max }, styleRange);
                inputEl.addEventListener("input", () => {
                    if (rangeEl.value == inputEl.value) return;
                    rangeEl.value = inputEl.value;
                    updateCallback();
                });
                rangeEl.addEventListener("input", () => {
                    if (inputEl.value == rangeEl.value) return;
                    inputEl.value = rangeEl.value;
                    updateCallback();
                });
                return [inputEl, rangeEl];
            }

            const updateFromRgbControls = () => {
                this.setColorByRgb([parseInt(this.#rInput.value), parseInt(this.#gInput.value), parseInt(this.#bInput.value)]);
                this.#hInput.value = this.#hSlider.value = this.hsvSl[0];
                this.#sHsvInput.value = this.#sHsvSlider.value = this.hsvSl[1];
                this.#vInput.value = this.#vSlider.value = this.hsvSl[2];
                this.#sHslInput.value = this.#sHslSlider.value = this.hsvSl[3];
                this.#lInput.value = this.#lSlider.value = this.hsvSl[4];
                this.updatePreview();
            };
            const updateFromHsvControls = () => {
                this.setColorByHsv([parseInt(this.#hInput.value), parseInt(this.#sHsvInput.value), parseInt(this.#vInput.value)]);
                this.#sHslInput.value = this.#sHslSlider.value = this.hsvSl[3];
                this.#lInput.value = this.#lSlider.value = this.hsvSl[4];
                this.#rInput.value = this.#rSlider.value = this.rgb[0];
                this.#gInput.value = this.#gSlider.value = this.rgb[1];
                this.#bInput.value = this.#bSlider.value = this.rgb[2];
                this.updatePreview();
            };
            const updateFromHslControls = () => {
                this.setColorByHsl([parseInt(this.#hInput.value), parseInt(this.#sHslInput.value), parseInt(this.#lInput.value)]);
                this.#sHsvInput.value = this.#sHsvSlider.value = this.hsvSl[1];
                this.#vInput.value = this.#vSlider.value = this.hsvSl[2];
                this.#rInput.value = this.#rSlider.value = this.rgb[0];
                this.#gInput.value = this.#gSlider.value = this.rgb[1];
                this.#bInput.value = this.#bSlider.value = this.rgb[2];
                this.updatePreview();
            };

            [this.#hInput, this.#hSlider] = addColorSlider(this.#container, 'Hue', 'h', updateFromHsvControls, 360, 0, 'background: linear-gradient(to right,hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%));');
            [this.#sHsvInput, this.#sHsvSlider] = addColorSlider(this.#container, 'Saturation (hsv)', 's_hsv', updateFromHsvControls, 100);
            [this.#vInput, this.#vSlider] = addColorSlider(this.#container, 'Value', 'v', updateFromHsvControls, 100);
            [this.#sHslInput, this.#sHslSlider] = addColorSlider(this.#container, 'Saturation (hsl)', 's_hsl', updateFromHslControls, 100);
            [this.#lInput, this.#lSlider] = addColorSlider(this.#container, 'Lightness', 'l', updateFromHslControls, 100);
            [this.#rInput, this.#rSlider] = addColorSlider(this.#container, 'R', 'r', updateFromRgbControls, 255);
            [this.#gInput, this.#gSlider] = addColorSlider(this.#container, 'G', 'g', updateFromRgbControls, 255);
            [this.#bInput, this.#bSlider] = addColorSlider(this.#container, 'B', 'b', updateFromRgbControls, 255);

            this.toggleDisplay(false);
            elementToAppend.append(this.#container);
        }

        setColorByHsv(hsv) {
            this.rgb = themeColorEditor.hsvToRgb(hsv);
            this.hsvSl = themeColorEditor.rgbToHsvSl(this.rgb);
        };

        setColorByHsl(hsl) {
            this.rgb = themeColorEditor.hslToRgb(hsl);
            this.hsvSl = themeColorEditor.rgbToHsvSl(this.rgb);
        }

        setColorByRgb(rgb) {
            this.rgb = [...rgb];
            this.hsvSl = themeColorEditor.rgbToHsvSl(rgb);
        };

        setControlsAccordingToVariables() {
            this.#rInput.value = this.#rSlider.value = this.rgb[0];
            this.#gInput.value = this.#gSlider.value = this.rgb[1];
            this.#bInput.value = this.#bSlider.value = this.rgb[2];
            this.#hInput.value = this.#hSlider.value = this.hsvSl[0];
            this.#sHsvInput.value = this.#sHsvSlider.value = this.hsvSl[1];
            this.#vInput.value = this.#vSlider.value = this.hsvSl[2];
            this.#sHslInput.value = this.#sHslSlider.value = this.hsvSl[3];
            this.#lInput.value = this.#lSlider.value = this.hsvSl[4];
            this.updatePreview();
        }

        setColorVariable(colorVar, showColorPicker = true) {
            this.#currentColorVariable?.colorDisplayEl.classList.toggle('selected-color-cell', false);
            if (!colorVar?.rgb) {
                console.log(`color variable ${colorVar?.name} didn't contain any rgb color info`);
                return;
            }
            this.#currentColorVariable = colorVar;
            this.#titleText.innerHTML = colorVar.name;
            this.setColorAndSetControls(colorVar.rgb);
            if (showColorPicker)
                this.toggleDisplay(true);
        }

        updateColorIfVariableWasChangedOutside(varInfo) {
            if (!varInfo
                || varInfo != this.#currentColorVariable
                || themeColorEditor.rgbEqual(varInfo.rgb, this.rgb))
                return;

            this.setColorAndSetControls(varInfo.rgb);
        }

        setColorAndSetControls(rgb) {
            if (!rgb || themeColorEditor.rgbEqual(this.rgb, rgb)) return;
            this.setColorByRgb(rgb);
            this.setControlsAccordingToVariables();
        }

        updatePreview = themeColorEditor.throttle(() => {
            if (!this.rgb || isNaN(this.rgb[0])) return;

            this.#colorPreviewEl.style.backgroundColor = themeColorEditor.rgbToHexString(this.rgb);

            // calculate min max values for slider background linear-gradients
            const colorSHsvMin = themeColorEditor.hsvToRgb([this.hsvSl[0], 0, this.hsvSl[2]]);
            const colorSHsvMax = themeColorEditor.hsvToRgb([this.hsvSl[0], 100, this.hsvSl[2]]);
            const colorVMin = themeColorEditor.hsvToRgb([this.hsvSl[0], this.hsvSl[1], 0]);
            const colorVMax = themeColorEditor.hsvToRgb([this.hsvSl[0], this.hsvSl[1], 100]);

            const rgbString = themeColorEditor.rgbToHexString(this.rgb);
            // hsv
            this.#sHsvSlider.style.background = `linear-gradient(to right, rgb(${[...colorSHsvMin]}), rgb(${[...colorSHsvMax]}))`;
            this.#vSlider.style.background = `linear-gradient(to right, rgb(${[...colorVMin]}), rgb(${[...colorVMax]}))`;
            this.#hSlider.style.setProperty('--custom-slider-background-color', `hsl(${this.hsvSl[0]} 100 50)`);
            this.#sHsvSlider.style.setProperty('--custom-slider-background-color', rgbString);
            this.#vSlider.style.setProperty('--custom-slider-background-color', rgbString);

            // hsl
            const hsl = [this.hsvSl[0], this.hsvSl[3], this.hsvSl[4]];
            this.#sHslSlider.style.background = `linear-gradient(to right, hsl(${hsl[0]} 0 ${hsl[2]}), hsl(${hsl[0]} 100 ${hsl[2]}))`;
            this.#lSlider.style.background = `linear-gradient(in hsl to right, hsl(${hsl[0]} ${hsl[1]} 0), hsl(${hsl[0]} ${hsl[1]} 50), hsl(${hsl[0]} ${hsl[1]} 100))`;
            this.#sHslSlider.style.setProperty('--custom-slider-background-color', rgbString);
            this.#lSlider.style.setProperty('--custom-slider-background-color', rgbString);

            // rgb
            this.#rSlider.style.background = `linear-gradient(to right, rgb(0, ${this.rgb[1]}, ${this.rgb[2]}), rgb(255, ${this.rgb[1]}, ${this.rgb[2]}))`;
            this.#rSlider.style.setProperty('--custom-slider-background-color', `rgb(${this.rgb[0]}, 0, 0)`);
            this.#gSlider.style.background = `linear-gradient(to right, rgb(${this.rgb[0]}, 0, ${this.rgb[2]}), rgb(${this.rgb[0]}, 255, ${this.rgb[2]}))`;
            this.#gSlider.style.setProperty('--custom-slider-background-color', `rgb(0, ${this.rgb[1]}, 0)`);
            this.#bSlider.style.background = `linear-gradient(to right, rgb(${this.rgb[0]}, ${this.rgb[1]}, 0), rgb(${this.rgb[0]}, ${this.rgb[1]}, 255))`;
            this.#bSlider.style.setProperty('--custom-slider-background-color', `rgb(0, 0, ${this.rgb[2]})`);

            if (document.activeElement != this.#hexInputEl)
                this.#hexInputEl.value = themeColorEditor.rgbToHexString(this.rgb, false);

            this.#currentColorVariable?.setColor(this.rgb);
        }, 50);

        toggleDisplay(show) {
            this.#container.classList.toggle('transition-hide', !show)
            if (!this.#currentColorVariable) return;

            this.#currentColorVariable.colorDisplayEl.classList.toggle('selected-color-cell', show);
            if (!show)
                this.#currentColorVariable = null;
        }
    },

    /**
     * Parse color variable table on html site and add controls.
     */
    parseVariables: function () {
        // add onclick events on the color variable table cells
        const tables = document.querySelectorAll("table");

        tables.forEach((table) => {
            // the color table contains "Variable name" in first cell
            const firstRowFirstCell = table.rows[0]?.cells[0];
            const notesColumnIndex = Array.from(table.rows[0]?.cells).findIndex((c) => c.textContent == 'Notes');
            if (firstRowFirstCell?.textContent.trim() !== 'Variable name') return;

            // set columns not too narrow
            table.rows[0].cells[0].style.minWidth = "18em";
            table.rows[0].cells[table.rows[0].cells.length - 1].style.minWidth = "25em";

            // add the controls to the color table
            // a color variable row is expected to have in that order (not necessarily consecutive)
            // * a cell containing only the color variable name
            // * a cell with no content and the color variable used for the background color
            // * a cell with a list of variable names that should have sufficient contrast
            Array.from(table.querySelectorAll("tr")).forEach((row) => {
                this.processVariableTableRow(row, notesColumnIndex);
            });
        });
    },

    /**
     * Processes a table row of the variable table.
     * @param {HTMLElement} row tr element
     * @param {*} notesColumnIndex index of the notes column
     */
    processVariableTableRow: function (row, notesColumnIndex) {
        let rowVariableName = undefined;
        let rowVariableNameElement = undefined;
        let rowVariableInfo = undefined;
        Array.from(row.querySelectorAll("td")).forEach((cell, columnIndex) => {
            const cellStyleBackgroundColor = cell.style.backgroundColor;

            // check if variable name cell
            if (!rowVariableName && /^--[\w-]+$/.test(cell.innerHTML.trim())) {
                rowVariableName = cell.innerHTML.trim();
                cell.innerHTML = '';
                cell.setAttribute('id', 'var-' + rowVariableName);
                this.createElementAndAdd('div', 'theme-color-editor-variable-title', cell, null, rowVariableName);
                rowVariableNameElement = cell;
            }

            // check if color display cell
            else if (rowVariableName && 'var(' + rowVariableName + ')' === cellStyleBackgroundColor
                && cell.textContent.trim() == '') {
                // add onclick event on color cell
                const thisCell = cell;
                cell.addEventListener('click', () => this.editColorInColorPicker(rowVariableName, thisCell));
                cell.style.setProperty('background', `var(${rowVariableName}, repeating-linear-gradient(-45deg, white 0 20px, red 20px 30px))`);
                cell.style.setProperty('cursor', 'pointer');

                // save variable with variable info (will be populated when all variables are collected)
                rowVariableInfo = new this.VariableInfo(rowVariableName);
                this.variableInfo.set(rowVariableName, rowVariableInfo);
                rowVariableInfo.colorDisplayEl = cell;
                rowVariableInfo.colorExplicitEl = this.createElementAndAdd('div', null, cell);
                this.addColorOptionElements(rowVariableInfo, rowVariableNameElement);
            } else if (notesColumnIndex == columnIndex) {
                // add links to the var anchors if a variable is mentioned in a code tag. clicking on the variable to edit its color
                Array.from(cell.querySelectorAll('code')).forEach((codeVarEl) => { this.addVariableLink(codeVarEl); });
                this.applyCustomWarnings(cell, rowVariableInfo);
            } else
                // check if cell with contrast variable names (and nothing else)
                if (rowVariableInfo && /^\s*(?:--[\w\-]+\s*)+$/.test(cell.textContent)) {
                    Array.from(cell.querySelectorAll('span')).forEach((spanVar) => {

                        const contrastVarName = spanVar.textContent.match(/--[\w\-]+/)?.[0];
                        if (!contrastVarName) return;
                        cell.classList.add('theme-color-editor-contrast-cell');

                        // at this point the variableInfo objects are not yet all in the map variableInfo
                        // so save only the var names at this point and set the actual objects later.

                        const contrastElement = document.createElement('span');
                        contrastElement.className = 'theme-color-editor-contrast-indicator';

                        const contrastVariableInfo = new this.ContrastVariableInfo(contrastVarName, contrastElement)

                        contrastVariableInfo.minContrast = spanVar.dataset.minContrast ?? 4.5; // if not specified use default min contrast of 4.5 (value for normal text in WCAG 2.0)

                        let contrastVariableAdded = false;
                        if (rowVariableInfo.contrastVariables) {
                            if (!rowVariableInfo.contrastVariables.some((el) => el.variableName == contrastVarName)) {
                                rowVariableInfo.contrastVariables.push(contrastVariableInfo);
                                contrastVariableAdded = true;
                            }
                        }
                        else {
                            rowVariableInfo.contrastVariables = [contrastVariableInfo];
                            contrastVariableAdded = true;
                        }

                        if (contrastVariableAdded) {
                            spanVar.parentElement.insertBefore(contrastElement, spanVar);

                            // luminance adjust button to get contrast
                            const contrastFixBt = this.createElementAndAdd('span', 'theme-color-editor-button theme-color-editor-inline', null, null, '◐');
                            contrastFixBt.addEventListener('click', () => this.fixContrastWithLightness(contrastVariableInfo.variable, new this.ContrastVariableInfo(rowVariableInfo, contrastVariableInfo.minContrast)));
                            spanVar.parentElement.insertBefore(contrastFixBt, spanVar);
                            contrastVariableInfo.elementResetToBaseColor = this.createElementAndAdd('span', 'theme-color-editor-button theme-color-editor-inline', null, 'Resets color to base value.', '⭯');
                            contrastVariableInfo.elementResetToBaseColor.addEventListener('click', () => contrastVariableInfo.variable?.resetToBase());
                            spanVar.parentElement.insertBefore(contrastVariableInfo.elementResetToBaseColor, spanVar);

                            let contrastVisualizer = this.createElementAndAdd('div', 'theme-color-editor-contrast-visualizer-circle', null, 'contrast visualizer', null, null, 'background-color: var(' + contrastVarName + ')');
                            spanVar.parentElement.insertBefore(contrastVisualizer, spanVar);
                            contrastVisualizer = this.createElementAndAdd('div', 'theme-color-editor-contrast-visualizer-circle', contrastVisualizer, null, null, null, 'background-color: var(' + rowVariableName + ')');
                            this.createElementAndAdd('div', 'theme-color-editor-contrast-visualizer-circle', contrastVisualizer, null, null, null, 'background-color: var(' + contrastVarName + ')');

                            this.addVariableLink(spanVar);
                        }
                    });
                }
        });
    },

    /**
     * Sets the initial values of all variables depending on the currently selected theme.
     */
    initializeVariables: function () {
        this.themeBaseDark = document.documentElement.classList.contains('view-dark');
        const useThemeName = document.documentElement.className.split(' ').find((c) => c.startsWith('theme-'));
        this.applyTheme(useThemeName);

        const rootStyles = this.baseCss.get('root');

        // set for each var which they do affect, the actual color as byte[] and the contrast var objects
        this.variableInfo.forEach((v) => {
            // if variable has rgb variant, add property
            const variableRgbName = v.name + '--rgb';
            v.hasFormatRgb = rootStyles.has(variableRgbName) && !this.variableInfo.has(variableRgbName);

            // set dependency of --inverse color variables
            if (v.name.length > 9 && v.name.substring(v.name.length - 10) == '--inverted') {
                const sourceVarName = this.variableInfo.get(v.name.substring(0, v.name.length - 10))?.name;
                if (sourceVarName) {
                    v.optionInvert = true;
                    v.saveExplicitRgbInOutput = true;
                    v.setValue(`var(${sourceVarName})`);
                }
            }

            // if color needs checks for contrast, set variable objects using the variable names
            v.contrastVariables?.forEach((contrastVariable) => {
                contrastVariable.variable = this.variableInfo.get(contrastVariable.variableName);

                if (contrastVariable.variable.ContrastVariableOfOtherColors)
                    contrastVariable.variable.ContrastVariableOfOtherColors.push(contrastVariable);
                else contrastVariable.variable.ContrastVariableOfOtherColors = [contrastVariable];

                contrastVariable.UpdateContrast(v.rgb);
            });
        });

        // add toc entries alphabetically sorted
        const tocElement = this.createElementAndAdd('div', 'theme-color-editor-control theme-color-editor-var-toc', document.body)
        this.createElementAndAdd('h3', null, tocElement, null, 'Variable list (alphabetically sorted)', null, 'color:white');
        let sortedArray = Array.from(this.variableInfo.keys());
        sortedArray.sort();
        sortedArray.forEach((v) => {
            this.createElementAndAdd('a', null, tocElement, null, v, { 'href': '#var-' + v });
            this.createElementAndAdd('br', null, tocElement);
        });
    },

    //#region html element functions

    /**
     * 
     * @param {string} tagName
     * @param {string?} className 
     * @param {HTMLElement?} appendTo 
     * @param {string?} title 
     */
    createElementAndAdd: function (tagName, className = null, appendTo = null, title = null, innerHtml = null, attributes = null, style = null) {
        let el = document.createElement(tagName);
        if (className) el.className = className;
        if (appendTo) appendTo.appendChild(el);
        if (title) el.title = title;
        if (innerHtml) el.innerHTML = innerHtml;
        if (attributes) {
            for (const [k, v] of Object.entries(attributes))
                el.setAttribute(k, v);
        }
        if (style) el.style = style;
        return el;
    },

    /**
     * Creates a checkbox.
     * @param {string} labelText 
     * @param {function} callbackOnChange 
     * @param {string} title 
     * @param {boolean} toggleButton if true the checkbox is displayed as toggle button
     * @returns 
     */
    createCheckbox: function (labelText, callbackOnChange = null, title = null, toggleButton = false, className = null) {
        const label = this.createElementAndAdd('label', (className ? className + ' ' : '') + (toggleButton ? 'theme-color-editor-toggle-button' : 'theme-color-editor-checkbox'), null, title, labelText, null, 'white-space: nowrap');
        const cb = this.createElementAndAdd('input', null, null, null, null, { 'type': 'checkbox' });
        if (callbackOnChange)
            cb.addEventListener('change', callbackOnChange);
        label.insertBefore(cb, label.firstChild);
        return label;
    },

    /**
     * Creates ui input element and binds it to property.
     * @param {string} inputType 
     * @param {string} controlText 
     * @param {object} model 
     * @param {string} propertyName 
     * @param {HTMLElement} addToElement 
     * @param {object} attributes 
     * @returns {HTMLElement} option control
     */
    addColorOptionControlAndBind: function (inputType, controlText, titleText, model, propertyName, addToElement, attributes = null) {
        if (attributes)
            attributes.type = inputType;
        else attributes = { 'type': inputType };

        let inputContainer;
        if (inputType == 'checkbox') {
            inputContainer = this.createCheckbox(controlText, null, titleText);
            addToElement?.appendChild(inputContainer);
        }
        else if (inputType == 'number') {
            if (controlText) {
                inputContainer = this.createElementAndAdd('label', 'theme-color-editor-number-label', addToElement, titleText, controlText);
                const input = this.createElementAndAdd('input', null, null, null, null, attributes);
                inputContainer.insertBefore(input, inputContainer.firstChild);
            }
        }

        const el = inputContainer ? inputContainer.firstElementChild :
            this.createElementAndAdd('input', null, addToElement, titleText, controlText, attributes);
        if (model && propertyName) {
            let propValue;
            Object.defineProperty(model, propertyName, {
                get: function () {
                    //console.log(`returning ${propertyName}: ${propValue} ${typeof propValue} of variable ${model.name}`);
                    return propValue;
                },
                set: function (newValue) {
                    if (propValue === newValue) return;
                    //console.log(`setting ${propertyName} of variable ${model.name} to new value ${newValue} (was ${propValue})`);
                    propValue = newValue;
                    if (el.type === 'checkbox')
                        el.checked = newValue;
                    else
                        el.value = newValue;
                    if (propertyName === 'useIndirectDefinition') {
                        model.enableIndirectDefinition(newValue);
                        model.updateDependencyVariables();
                    }
                    if (model.useIndirectDefinition)
                        model.updateValueFromAffectors();
                }
            });
            if (inputType === 'number')
                el.addEventListener('change', (e) => model[propertyName] = parseFloat(e.target.value));
            else if (inputType === 'checkbox')
                el.addEventListener('change', (e) => model[propertyName] = e.target.checked);
            else
                el.addEventListener('change', (e) => model[propertyName] = e.target.value);
        }
        return el;
    },

    /**
     * Adds interactivity to a variable name in a text (click event for color editing and prepend link to jump to color row).
     * @param {HTMLElement} el 
     */
    addVariableLink: function (el) {
        const varName = el.textContent.match(/^--[\w\-]+$/)?.[0];
        if (!varName) return;
        el.addEventListener('click', () => this.editColorInColorPicker(varName));
        el.classList.add('theme-color-editor-pointer');
        el.title += 'Click to edit color';

        const linkToVarWrapper = this.createElementAndAdd('span', 'theme-color-editor-link-to-var-wrapper');
        el.parentElement.insertBefore(linkToVarWrapper, el);
        const linkToVar = this.createElementAndAdd('a', 'theme-color-editor-button theme-color-editor-inline theme-color-editor-link-to-var', null, 'jump to color row', '↪', { 'href': '#var-' + varName });
        linkToVarWrapper.append(linkToVar, el);
    },

    /**
     * Adds color variable option controls
     * @param {VariableInfo} colorVariableInfo 
     * @param {HTMLElement} colorVarNameElement 
     */
    addColorOptionElements: function (colorVariableInfo, colorVarNameElement) {
        // copy paste buttons
        const buttonContainer = this.createElementAndAdd('div', null, colorVarNameElement);
        buttonContainer.dataset.varName = colorVariableInfo.name;
        colorVariableInfo.elementEqualToBaseColor = this.createElementAndAdd('span', 'theme-color-editor-variable-changed-indicator', buttonContainer);
        colorVariableInfo.elementEqualToBaseColor.style.backgroundColor = 'gray';

        const hiddenSettingsContainer = this.createElementAndAdd('div', 'theme-color-editor-variable-hidden-settings', buttonContainer);
        let bt = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-inline', hiddenSettingsContainer, 'copy this variable value to paste it in other variables', 'copy');
        bt.addEventListener('click', (e) => { this.holdVariable = this.variableInfo.get(e.target.parentElement.parentElement.dataset.varName); });
        bt = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-inline', hiddenSettingsContainer, 'paste color value directly without dependency', 'paste value');
        bt.addEventListener('click', (e) => { this.setValueOfVariableByName(e.target.parentElement.parentElement.dataset.varName, this.holdVariable); });
        bt = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-inline', hiddenSettingsContainer, 'paste reference of copied variable, so this variable will adjust accordingly', 'paste ref');
        bt.addEventListener('click', (e) => { this.setValueOfVariableByName(e.target.parentElement.parentElement.dataset.varName, this.holdVariable, true); });

        bt = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-inline', buttonContainer, 'Tries to fix all the contrast issues of this variable to the colors in the contrast column in this row by changing the lightness of the var ' + colorVariableInfo.name, '◐');
        bt.addEventListener('click', (e) => { this.fixContrastWithLightness(this.variableInfo.get(e.target.parentElement.dataset.varName)); });
        bt = colorVariableInfo.elementResetToBaseColor = this.createElementAndAdd('button', 'theme-color-editor-button theme-color-editor-inline', buttonContainer, 'reset color', '⭯');
        bt.addEventListener('click', (e) => { this.variableInfo.get(e.target.parentElement.dataset.varName)?.resetToBase(); });

        this.createElementAndAdd('br', null, buttonContainer);
        this.addColorOptionControlAndBind('checkbox', 'use indirect definition',
            'use the indirect definition in the text input below for this color (will update automatically if the according colors change)',
            colorVariableInfo, 'useIndirectDefinition', buttonContainer);
        const indirectDefinitionEl = this.createElementAndAdd('input', null, buttonContainer, null, null, { 'type': 'text' }, "width:100%;");
        colorVariableInfo.setDependsOnVarsElement(indirectDefinitionEl);

        let subContainer = this.createElementAndAdd('div', 'theme-color-editor-checkbox-subcontainer', buttonContainer);
        const cbSaveExplicit = this.addColorOptionControlAndBind('checkbox', 'save explicit color output',
            'save the explicit color value in the css output instead of the indirect definition\nThis allows further automatic adjustments like inversion or hue rotation',
            colorVariableInfo, 'saveExplicitRgbInOutput', subContainer);

        subContainer = this.createElementAndAdd('div', 'theme-color-editor-checkbox-subcontainer', subContainer);
        //cbSaveExplicit.addEventListener('change', function () { subContainer.style.display = this.checked ? 'block' : 'none' });
        this.addColorOptionControlAndBind('checkbox', 'invert', 'invert the color', colorVariableInfo, 'optionInvert', subContainer);
        this.createElementAndAdd('br', null, subContainer);
        this.addColorOptionControlAndBind('number', ' hue rotation in deg (0-360)', 'hue rotation in degree (0: no change)', colorVariableInfo, 'optionHueRotate', subContainer, { 'size': '3', 'value': '0' });
        this.createElementAndAdd('br', null, subContainer);
        this.addColorOptionControlAndBind('number', ' saturation factor', 'saturation factor (1: no change)', colorVariableInfo, 'optionSaturationFactor', subContainer, { 'size': '3', 'value': '1', 'min': '0', 'step': '0.1' });
        this.createElementAndAdd('br', null, subContainer);
        this.addColorOptionControlAndBind('number', ' lightness', 'lightness factor (1: no change)', colorVariableInfo, 'optionLightnessFactor', subContainer, { 'size': '3', 'value': '1', 'min': '0', 'step': '0.1' });

        colorVarNameElement.classList.add('theme-color-editor-variable-name-container');
    },

    /**
     * Adds custom warnings to variable notes
     * @param {HTMLElement} cell 
     * @param {VariableInfo} variableInfo 
     */
    applyCustomWarnings: function (cell, variableInfo) {
        if (!cell || !variableInfo) return;

        if (cell.innerText.includes('do not make this red')) {
            // this variable should not be too reddish
            const warningSpan = this.createElementAndAdd('span', 'theme-color-editor-warning', null, 'The variable is maybe too reddish', '⚠', null, 'display:none');
            cell.insertBefore(warningSpan, cell.firstChild);
            variableInfo.customOnChangeFunction = function () {
                // warn if color is too reddish
                if (!this.rgb) return;
                const hsvSl = themeColorEditor.rgbToHsvSl(this.rgb);
                warningSpan.style.display = (hsvSl && (hsvSl[0] < 18 || hsvSl[0] > 344) && hsvSl[3] > 35 && hsvSl[4] > 15) ? 'inline-block' : 'none';
            }
            return;
        }
        if (variableInfo.name == '--wiki-content-redlink-color') {
            // this variable should be rather red
            const warningSpan = this.createElementAndAdd('span', 'theme-color-editor-warning', null, 'The variable should be maybe more reddish', '⚠', null, 'display:none');
            cell.insertBefore(warningSpan, cell.firstChild);
            variableInfo.customOnChangeFunction = function () {
                // warn if color is not reddish enough
                if (!this.rgb) return;
                const hsvSl = themeColorEditor.rgbToHsvSl(this.rgb);
                if (!hsvSl) return;
                warningSpan.style.display = ((hsvSl[0] > 20 && hsvSl[0] < 340) || hsvSl[3] < 30 || hsvSl[4] < 15 || hsvSl[4] > 90) ? 'inline-block' : 'none';
            }
            return;
        }
    },

    //#endregion

    //#region contrast functions
    /**
     * Returns approximated color with set relative luminance while keeping preserve hue and saturation.
     * It's an iterativ process using that the dependence of the relative luminance on the lightness is monotonically non-decreasing
     * @param rgb 
     * @param relativeLuminanceTarget 
     */
    setRelativeLuminance: function (rgb, relativeLuminanceTarget, maxDifference = 0.005) {
        let loopCounter = 0;
        let adjustedColor;
        let diff;

        let minLightness = 0;
        let maxLightness = 100;
        const hsvsl = this.rgbToHsvSl(rgb);
        const hsl = [hsvsl[0], hsvsl[3], hsvsl[4]];
        while (loopCounter < 20) {
            loopCounter++;
            const lightness = (minLightness + maxLightness) / 2;
            adjustedColor = this.hslToRgb([hsl[0], hsl[1], lightness]);
            diff = relativeLuminanceTarget - this.relativeLuminance(adjustedColor);
            if (Math.abs(diff) < maxDifference) {
                break;
            }
            if (diff > 0)
                minLightness = lightness;
            else
                maxLightness = lightness;
        }

        //console.log('adjusted color in ' + loopCounter + ' steps, difference: ' + diff);
        return adjustedColor;
    },

    /**
     * Change lightness of color.
     * @param color 
     * @param lightnessFactor >1 makes it brighter, <1 darker
     */
    adjustLightness: function (color, lightnessFactor) {
        if (lightnessFactor == 1) return color;
        lightnessFactor = Math.max(0, lightnessFactor);
        return color.map(v => {
            return Math.min(255, Math.round(v * lightnessFactor));
        });
    },

    /**
     * Calculates the relative luminance in the range [0,1].
     * @param {number[]} rgb 
     * @returns 
     */
    relativeLuminance: function (rgb) {
        const sRgb = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
        const rRgb = [
            sRgb[0] < 0.03928 ? sRgb[0] / 12.92 : Math.pow((sRgb[0] + 0.055) / 1.055, 2.4),
            sRgb[1] < 0.03928 ? sRgb[1] / 12.92 : Math.pow((sRgb[1] + 0.055) / 1.055, 2.4),
            sRgb[2] < 0.03928 ? sRgb[2] / 12.92 : Math.pow((sRgb[2] + 0.055) / 1.055, 2.4)
        ];
        return 0.2126 * rRgb[0] + 0.7152 * rRgb[1] + 0.0722 * rRgb[2];
    },

    /**
     * Calculates the contrast between two colors using the relative luminance.
     * @param {number[]} rgb1 
     * @param {number[]} rgb2 
     * @returns 
     */
    colorContrast: function (rgb1, rgb2) {
        if (!rgb1 || !rgb2) return undefined;
        const relLum1 = this.relativeLuminance(rgb1);
        const relLum2 = this.relativeLuminance(rgb2);
        return this.luminanceContrast(relLum1, relLum2);
    },

    luminanceContrast: function (relLum1, relLum2) {
        if (relLum1 > relLum2) return (relLum1 + 0.05) / (relLum2 + 0.05);
        return (relLum2 + 0.05) / (relLum1 + 0.05);
    },

    /**
     * Returns the lower max and the upper min needed luminance to get a specified contrast to a given relative luminance
     * i.e. the luminance may not be in the returned range to yield the desired contrast.
     * @param {number} relativeLuminance
     * @param {number} neededContrast
     */
    neededLuminanceForContrast: function (relativeLuminance, neededContrast) {
        if (neededContrast < 1) return [relativeLuminance, relativeLuminance];
        return [(relativeLuminance + 0.05) / neededContrast - 0.05, neededContrast * (relativeLuminance + 0.05) - 0.05];
    },

    /**
     * Adjusts the lightness of varToAdjust trying to fix contrast issues.
     * @param {VariableInfo} varToAdjust 
     * @param {ContrastVariableInfo} onlyToVar
     */
    fixContrastWithLightness: function (varToAdjust, onlyToVar = null) {
        if (!varToAdjust) return;

        const contrastToVariables = onlyToVar ? [onlyToVar] : varToAdjust.contrastVariables;
        if (!contrastToVariables || contrastToVariables.length == 0) return;

        let luminanceMean = 0;
        // determine range of luminances that are not allowed to get the desired contrast
        const avoidLuminance = contrastToVariables.reduce((blockedRange, cv) => {
            const luminance = this.relativeLuminance(cv.variable.rgb);
            luminanceMean += luminance;
            const luminanceBlock = this.neededLuminanceForContrast(luminance, cv.minContrast);
            if (luminanceBlock[0] == luminanceBlock[1])
                return blockedRange; // no forbidden luminances
            if (blockedRange[0] === undefined || blockedRange[0] > luminanceBlock[0])
                blockedRange[0] = luminanceBlock[0];
            if (blockedRange[1] === undefined || blockedRange[1] < luminanceBlock[1])
                blockedRange[1] = luminanceBlock[1];
            return blockedRange;
        }, [undefined, undefined]);
        luminanceMean /= contrastToVariables.length;
        //console.log(`blocked luminance range: ${avoidLuminance}`);

        const luminanceOfColorToAdjust = this.relativeLuminance(varToAdjust.rgb);
        if ((avoidLuminance[0] === undefined && avoidLuminance[1] === undefined)
            || luminanceOfColorToAdjust <= avoidLuminance[0] || luminanceOfColorToAdjust >= avoidLuminance[1]) {
            console.log('contrast is already sufficient, color will not be adjusted');
            return;
        }

        // increase change a bit to make sure the contrast is achieved
        avoidLuminance[0] = Math.max(avoidLuminance[0] - 0.005, 0);
        avoidLuminance[1] = Math.min(avoidLuminance[1] + 0.005, 1);

        if (avoidLuminance[0] < 0 && avoidLuminance[1] > 1) {
            //console.log('no luminance to get needed contrast to all given colors.');
            // luminance of .18 approximately has same contrast to 0 and 1, use best possible contrast.
            varToAdjust.setColor(luminanceMean < 0.18 ? [255, 255, 255] : [0, 0, 0]);
            return;
        }

        if (luminanceMean < 0.18) {
            //console.log(`contrast colors are rather dark (mean luminance: ${luminanceMean})`);
            if (avoidLuminance[1] <= 1) {
                //console.log(`increasing luminance to ${avoidLuminance[1]}`);
                varToAdjust.setColor(this.setRelativeLuminance(varToAdjust.rgb, avoidLuminance[1]));
                return;
            } else {
                //console.log(`needed increasing not possible, decreasing luminance to ${avoidLuminance[0]}`);
                varToAdjust.setColor(this.setRelativeLuminance(varToAdjust.rgb, avoidLuminance[0]));
                return;
            }
        }

        //console.log(`contrast colors are rather light (mean luminance: ${luminanceMean})`);
        if (avoidLuminance[0] >= 0) {
            //console.log(`decreasing luminance to ${avoidLuminance[0]}`);
            varToAdjust.setColor(this.setRelativeLuminance(varToAdjust.rgb, avoidLuminance[0]));
            return;
        } else {
            //console.log(`needed decreasing not possible, increasing luminance to ${avoidLuminance[1]}`);
            varToAdjust.setColor(this.setRelativeLuminance(varToAdjust.rgb, avoidLuminance[1]));
            return;
        }
    },
    //#endregion

    //#region variable editing
    /**
     * Sets the value or color of the variable given by its name.
     * @param {string} varName variable to be changed
     * @param {VariableInfo} variableSource variable which value is used
     * @param {boolean} pasteRef if true the variable is referenced to the source variable.
     * @returns 
     */
    setValueOfVariableByName: function (varName, variableSource, pasteRef = false) {
        if (!varName || !variableSource) return;
        const varInfo = this.variableInfo.get(varName);
        if (!varInfo) return;

        if (pasteRef)
            varInfo.setValue(`var(${variableSource.name})`);
        else
            varInfo.setColor(variableSource.rgb);
    },

    /**
     * Sets a new color for editing.
     * @param {string} varName
     * @param {HTMLElement} cell 
     */
    editColorInColorPicker: function (varName) {
        if (!varName || this.colorPicker.currentColorVariable?.name == varName) {
            // no color or same color clicked, hide color picker
            this.colorPicker.toggleDisplay(false);
            return;
        }

        const variableToEdit = this.variableInfo.get(varName);
        if (!variableToEdit) {
            console.log(`Error: unknown variable ${varName}, cannot edit.`);
            this.colorPicker.toggleDisplay(false);
            return;
        }

        this.colorPicker.setColorVariable(variableToEdit);
    },

    /**
     * Updates the variable value on the page and recalculates the contrast checker.
     * @param {VariableInfo} variable 
     */
    updateVariableOnPage: function (variable) {
        if (!variable) return;
        const varValue = variable.defaultVariableStringOutput();
        //console.log(`now updating page style of var ${variable.name}: ${varValue}`);
        if (varValue)
            document.documentElement.style.setProperty(variable.name, varValue);
        // if variable has rgb variant, also save that
        const varValueRgb = variable.hasFormatRgb ? variable.valueColorAsCommaRgbString() : null;
        if (varValueRgb)
            document.documentElement.style.setProperty(variable.name + '--rgb', varValueRgb);

        // update variable on previews
        this.previewPopups.forEach((p) => {
            if (p.closed) return;
            if (varValue)
                p.document.documentElement.style.setProperty(variable.name, varValue);
            if (varValueRgb)
                p.document.documentElement.style.setProperty(variable.name + '--rgb', varValueRgb);
        });

        // update contrast indicators
        variable.contrastVariables?.forEach((cv) => {
            cv.UpdateContrast(variable.rgb);
        });
        variable.ContrastVariableOfOtherColors?.forEach((cv) => {
            cv.UpdateContrast();
        });

        this.colorPicker.updateColorIfVariableWasChangedOutside(variable);
    },

    //#endregion

    openPreviewWindow: function (pageName) {
        if (!pageName) {
            pageName = document.getElementById('theme-color-editor-preview-page-name')?.value;
            if (pageName)
                localStorage.setItem('theme-color-editor-preview-page-name', pageName);
        }
        if (!pageName) return;

        const rect = localStorage.getItem('theme-creator-popup-rect');
        let location = rect ? `, ${rect}` : '';

        const w = window.open(pageName, '', 'popup' + location);
        if (!w) {
            console.log(`preview popup of page name ${pageName} couldn't be opened`);
            return;
        }

        w.addEventListener("DOMContentLoaded", () => {
            this.setBackgroundImageExplicitly(w, getComputedStyle(window.document.body)?.backgroundImage);
            this.variableInfo.forEach((v) => {
                // apply current values to preview
                const varValue = v.defaultVariableStringOutput();
                if (varValue)
                    w.document.documentElement.style.setProperty(v.name, varValue);
                // if variable has rgb variant, also save that
                const varValueRgb = v.hasFormatRgb ? v.valueColorAsCommaRgbString() : null;
                if (varValueRgb)
                    w.document.documentElement.style.setProperty(v.name + '--rgb', varValueRgb);
            });
        });

        this.previewPopups.push(w);
        this.previewPopups = this.previewPopups.filter((p) => !p.closed);
    },

    saveDefaultPopupLocation: function () {
        const p = this.previewPopups.find((pi) => !pi.closed);
        if (p)
            localStorage.setItem('theme-creator-popup-rect', `screenX=${p.screenX}, screenY=${p.screenY}, width=${p.innerWidth}, height=${p.innerHeight}`);
    },

    /**
     * Calculates a css filter to convert black to a given rgb color. It's an iterativ approximation, not perfect, should be sufficient to not be distinguishable for humans.
     */
    filterCreator: {
        /**
         * @param {number[]} rgb color in rgb (0-255)
         * @returns {object} Best estimate in an object {input, steps, error, filterString}.
         */
        calculateFilter: function (rgb) {
            if (!rgb) return null;

            let rgbIn = [...rgb];
            const results = [];

            let hslIn = this.rgbToHsl(rgbIn);

            // always start from a black color and the two filters: invert(0.5) sepia(1)

            rgb = this.invert(rgbIn, 0.5);
            rgb = this.sepia(rgb, 1);
            const rgbAfterSepia = rgb;
            let hsl;

            let solution; // hue rotate deg, sat, brightness
            let finalOffsets = [0, 1, 1]; // compensate error caused by other operations

            for (let i = 0; i < 40; i++) {
                hsl = this.rgbToHsl(rgbAfterSepia);
                solution = [0, 1, 1];

                // hue
                solution[0] += hslIn[0] + finalOffsets[0] - hsl[0];
                rgb = this.hueRotate(rgbAfterSepia, solution[0]);
                hsl = this.rgbToHsl(rgb);

                // do brightness before saturation, because the brightness filter alters saturation so much
                // brightness
                solution[2] *= hslIn[2] * finalOffsets[2] / hsl[2];
                rgb = this.brightness(rgb, solution[2]);
                hsl = this.rgbToHsl(rgb);

                // saturation
                solution[1] *= hslIn[1] * finalOffsets[1] / hsl[1];
                rgb = this.saturate(rgb, solution[1]);
                hsl = this.rgbToHsl(rgb);

                const filterString = `invert(0.5) sepia(1) hue-rotate(${this.roundToDigits(solution[0], 3)}deg) brightness(${this.roundToDigits(solution[2] * 100, 3)}%) saturate(${this.roundToDigits(solution[1] * 100, 3)}%)`;
                const rgbError = Math.abs(rgb[0] - rgbIn[0]) + Math.abs(rgb[1] - rgbIn[1]) + Math.abs(rgb[2] - rgbIn[2]);

                results.push({ step: i, filter: filterString, error: rgbError });
                if (rgbError < 3) break;

                const damping = .5; // to avoid oszillation. Could be improved probably, seems to work well enough with 40 loops.
                finalOffsets[0] += Math.round((hslIn[0] - hsl[0]) * damping) % 360;
                finalOffsets[1] *= hsl[1] > 0 ? Math.pow(hslIn[1] / hsl[1], damping) : 1;
                finalOffsets[2] *= hsl[2] > 0 ? Math.pow(hslIn[2] / hsl[2], damping) : 1;
            }

            results.sort((a, b) => a.error - b.error);

            // return best result
            return { input: rgbIn, steps: results[0].step, error: results[0].error, filterString: results[0].filter };
        },

        roundToDigits: function (v, d) {
            const pot = Math.pow(10, d);
            return Math.round(v * pot) / pot;
        },

        rgbToHsl: function ([r, g, b]) {
            r /= 255;
            g /= 255;
            b /= 255;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const d = max - min;
            let h = 0;

            switch (max) {
                case min:
                    h = 0;
                    break;
                case r:
                    h = (60 * (g - b) / d + 360) % 360;
                    break;
                case g:
                    h = (60 * (b - r) / d + 120) % 360;
                    break;
                case b:
                    h = (60 * (r - g) / d + 240) % 360;
                    break;
            }

            return [
                h,
                d == 0 ? 0 : 100 * d / (1 - Math.abs(max + min - 1)),
                (max + min) * 50
            ];
        },

        multiplyWithMatrix: function ([r, g, b], matrix) {
            return [
                this.clamp(r * matrix[0] + g * matrix[1] + b * matrix[2]),
                this.clamp(r * matrix[3] + g * matrix[4] + b * matrix[5]),
                this.clamp(r * matrix[6] + g * matrix[7] + b * matrix[8])
            ];
        },
        clamp: function (n) {
            return Math.min(255, Math.max(0, n));
        },

        // the following functions are defined on https://www.w3.org/TR/filter-effects
        linear: function ([r, g, b], slope = 1, intercept = 0) {
            return [
                this.clamp(r * slope + intercept * 255),
                this.clamp(g * slope + intercept * 255),
                this.clamp(b * slope + intercept * 255)];
        },
        brightness: function (rgb, value = 1) { return this.linear(rgb, value); },

        sepia: function (rgb, value = 1) {
            return this.multiplyWithMatrix(rgb, [
                0.393 + 0.607 * (1 - value), 0.769 - 0.769 * (1 - value), 0.189 - 0.189 * (1 - value),
                0.349 - 0.349 * (1 - value), 0.686 + 0.314 * (1 - value), 0.168 - 0.168 * (1 - value),
                0.272 - 0.272 * (1 - value), 0.534 - 0.534 * (1 - value), 0.131 + 0.869 * (1 - value)
            ]);
        },
        saturate: function (rgb, value = 1) {
            return this.multiplyWithMatrix(rgb, [
                0.213 + 0.787 * value, 0.715 - 0.715 * value, 0.072 - 0.072 * value,
                0.213 - 0.213 * value, 0.715 + 0.285 * value, 0.072 - 0.072 * value,
                0.213 - 0.213 * value, 0.715 - 0.715 * value, 0.072 + 0.928 * value
            ]);
        },

        hueRotate: function (rgb, angle = 0) {
            angle = angle * Math.PI / 180;
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
            return this.multiplyWithMatrix(rgb, [
                0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
                0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.140, 0.072 - cos * 0.072 - sin * 0.283,
                0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072
            ]);
        },
        invert: function ([r, g, b], value = 1) {
            return [
                this.clamp((value + (r / 255) * (1 - 2 * value)) * 255),
                this.clamp((value + (g / 255) * (1 - 2 * value)) * 255),
                this.clamp((value + (b / 255) * (1 - 2 * value)) * 255)
            ];
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", () => {
        themeColorEditor.initialize();
    });
} else {
    themeColorEditor.initialize();
}
