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
// Run this script in the browser console of a wiki page with a specific table of defined color variables, e.g. on ...wiki.gg/wiki/MediaWiki:Common.css and add the styles of theme-color-editor.css. The variable table needs to have the following format
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
    variableInfo: undefined,
    colorPicker: undefined,
    /**
     * Clipboard-like variable used to copy/paste colors
     */
    holdVariable: undefined,
    /**
     * If true and a variable has an --rgb variant, it's included in the output
     */
    exportIncludeRgbVariants: false,
    /**
     * If true the explicit color adjustment options are also exported. Used to save work on a theme and import again in a later session.
     */
    exportIncludeExplicitOptions: false,
    /**
     * References to preview popups where the styles are applied.
     * Each entry is an object with property w: window, s: style element to adjust the styles
     */
    previewPopups: undefined,
    /**
     * collection of base css, key is name (e.g. view-light, view-dark, theme-my-theme-name)
     * value is map of rules (key: var name, value: var value)
     */
    baseCss: undefined,
    /**
     * Indicator if the current theme is based on dark view or light view.
     * To also set the UI element accordingly use the function setThemeView(viewDark: boolean).
     */
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

    /**
     * css rule for the applied page styles
     */
    pageRules: undefined,

    initialize: function () {
        // check if page should display the color editor
        let initializeColorEditor = false;
        for (let table of document.querySelectorAll('table')) {
            if (table.rows.length < 2 || table.rows[0].length < 3) continue;
            // the color table contains "Variable name" in first cell
            if (table.rows[0].cells[0].textContent.trim() !== 'Variable name') continue;

            const secondRowFirstCell = table.rows[1].cells[0];
            if (secondRowFirstCell.innerText.match(/^--[-\w]+$/)) {
                initializeColorEditor = true;
                break;
            }
        }
        if (!initializeColorEditor) return;

        this.pageRules = this.addPreviewStyleElement(document);

        // define variables
        this.variableInfo = new Map()
        this.previewPopups = [];
        this.baseCss = new Map();

        this.addToolbar();
        this.colorPicker = new this.ColorPicker(document.body);
        this.parseVariables();
        this.parseBaseThemes();
        this.addThemesToSelector();
        this.initializeVariables();
    },

    /**
     * Creates a style element in the document head where the variable values are stored to be visible.
     * @param {document} doc 
     * @returns 
     */
    addPreviewStyleElement: function (doc) {
        //this.createElementAndAdd('style', null, doc.head, null, null, { type: 'text/css' });
        const styleElement = doc.createElement('style');
        styleElement.setAttribute('type', 'text/css');
        styleElement.setAttribute('id', 'tcolor-editor-styles');
        doc.head.appendChild(styleElement);
        styleElement.sheet.insertRule(':root {}');
        return styleElement.sheet.cssRules[0].style;
    },

    //#region color parsing
    /**
     * Parses a color from a string, accepts input like '#ff113a', 'rgb(24, 144, 0)', rgba(120, 20, 80, 0.5).
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
        let rgbMatch = rgbString.match(/(?:rgba?\()?(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,]+([\d.]+))?\)?/);
        if (rgbMatch) {
            const rgb = rgbMatch.slice(1, 4).map(Number);
            rgb.push(rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]));
            return rgb;
        }
        // parse e.g. color(srgb 0.4 1 0.2)
        rgbMatch = rgbString.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s+\/\s+([\d.]+))?\)?/);
        if (rgbMatch) {
            const rgb = rgbMatch.slice(1, 4).map(v => Math.round(parseFloat(v) * 255));
            rgb.push(rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]));
            return rgb;
        }

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
        if (hexString.length == 3 || hexString.length == 4) {
            // convert 3-digit hex to 6-digit hex ("rgb" -> "rrggbb")
            hexString = hexString.split('').map(c => c + c).join('');
        }

        // ensure it's a valid hex color code
        if (!/^[\dA-Fa-f]{6}(?:[\dA-Fa-f]{2})?$/.test(hexString)) {
            if (logErrors)
                console.warn(`Invalid hex color format: ${hexString}. Use rgb, rrggbb, rgba or rrggbbaa format.`);
            return null;
        }

        return [
            parseInt(hexString.slice(0, 2), 16),
            parseInt(hexString.slice(2, 4), 16),
            parseInt(hexString.slice(4, 6), 16),
            hexString.length == 8 ? parseInt(hexString.slice(6, 8), 16) / 255 : 1
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
        if (!rgb || rgb.length < 3) return null;
        const alphaPart = rgb.length == 4 && rgb[3] < 1 ? Math.round(rgb[3] * 255).toString(16).padStart(2, '0') : '';
        return (prependHash ? '#' : '') + rgb.slice(0, 3).reduce((result, color) => result + color.toString(16).padStart(2, '0'), '') + alphaPart;
    },

    /**
     * Converts an rgb array to a comma separated string, used for the --rgb variables. Ignores alpha.
     * @param {byte[]} rgb
     * @returns {string} 
     */
    rgbArrayToRgbCsvString: function (rgb) {
        if (!rgb) return '';
        return `${rgb[0]},${rgb[1]},${rgb[2]}`
    },

    hsvToRgb: function ([h, s, v], alpha = 1) {
        let f = (n) => {
            let k = (n + h / 60) % 6;
            return Math.round(v * (1 - s * Math.max(Math.min(k, 4 - k, 1), 0)) * 255);
        };
        s /= 100;
        v /= 100;
        return [f(5), f(3), f(1), alpha];
    },

    /**
     * h [0,360], s [0,100], l [0,100]
     */
    hslToRgb: function ([h, s, l], alpha = 1) {
        let f = (n) => {
            let k = (n + h / 30) % 12;
            return Math.round((l - s * Math.min(l, 1 - l) * Math.max(Math.min(k - 3, 9 - k, 1), -1)) * 255);
        };
        s /= 100;
        l /= 100;
        return [f(0), f(8), f(4), alpha];
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
        const mixedColor = [0, 0, 0, 0];
        let weightingSum = 0;

        for (let i = 0; i < rgbColors.length; i++) {
            const weight = (mixFractions && mixFractions.length > i) ? mixFractions[i] : 1;
            if (weight <= 0) continue;
            const addColorRgb = rgbColors[i];
            if (!addColorRgb) continue;
            weightingSum += weight;
            mixedColor[0] += addColorRgb[0] * weight;
            mixedColor[1] += addColorRgb[1] * weight;
            mixedColor[2] += addColorRgb[2] * weight;
            mixedColor[3] += addColorRgb[3] * weight;
        }
        if (weightingSum == 0) return [0, 0, 0];
        mixedColor[0] = Math.round(mixedColor[0] / weightingSum);
        mixedColor[1] = Math.round(mixedColor[1] / weightingSum);
        mixedColor[2] = Math.round(mixedColor[2] / weightingSum);
        mixedColor[3] = mixedColor[3] / weightingSum;

        return mixedColor;
    },

    /**
     * Inverse of the color.
     * @param {number[]} rgb 
     */
    invertedColor: function (rgb) {
        if (!rgb) return null;
        return [255 - rgb[0], 255 - rgb[1], 255 - rgb[2], rgb[3]];
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
            Math.round(rgb[2] + amount * (255 - 2 * rgb[2])),
            rgb[3]
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
        return this.hslToRgb([hsvsl[0] + hueRotate, hsvsl[3], hsvsl[4]], rgb[3]);
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
        return this.hslToRgb(
            [
                hsvsl[0] + (hueRotate === undefined ? 0 : hueRotate),
                saturationFactor === undefined ? hsvsl[3] : Math.min(100, Math.max(0, hsvsl[3] * saturationFactor)),
                lightnessFactor === undefined ? hsvsl[4] : Math.min(100, Math.max(0, hsvsl[4] * lightnessFactor))
            ],
            rgb[3]
        );
    },

    /**
     * Inverse lightness of the color.
     * @param {number[]} rgb 
     */
    inverseLightnessOfColor: function (rgb) {
        if (!rgb) return null;
        const hsvsl = this.rgbToHsvSl(rgb);
        return this.hslToRgb([hsvsl[0], hsvsl[3], 100 - hsvsl[4]], rgb[3]);
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
     * Returns true if the first 4 elements of the arrays are equal.
     * @param {number[]} rgb1 
     * @param {number[]} rgb2
     */
    rgbEqual: function (rgb1, rgb2) {
        if (!rgb1 && !rgb2) return true;
        if (!rgb1 || !rgb2) return false;
        return rgb1[0] == rgb2[0]
            && rgb1[1] == rgb2[1]
            && rgb1[2] == rgb2[2]
            && rgb1[3] == rgb2[3];
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
                            || (selectorName !== ':root'
                                && selectorName !== 'html'
                                && selectorName !== '.view-light'
                                && selectorName !== '.view-dark'
                                && !selectorName.startsWith('.theme-'))
                        ) return;

                        if (selectorName === 'html')
                            selectorName = 'root';
                        else
                            selectorName = selectorName.substring(1); // remove colon or dot

                        if (!this.baseCss.has(selectorName))
                            this.baseCss.set(selectorName, new Map());
                        const ruleProperties = this.baseCss.get(selectorName);

                        const ruleCount = rule.style.length;
                        for (let i = 0; i < ruleCount; i++) {
                            const propName = rule.style[i];
                            const propNameWithOutRgb = propName.endsWith('--rgb') ? propName.substring(0, propName.length - 5) : undefined;
                            if (this.variableInfo.has(propName)
                                || (propNameWithOutRgb && this.variableInfo.has(propNameWithOutRgb))) {
                                ruleProperties.set(propName, rule.style.getPropertyValue(propName).trim());
                            }
                        }
                    });
                }
            } catch (e) {
                console.warn('cannot access stylesheet: ', e);
            }
        }

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
        });
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
     * @returns {boolean} whether the theme could be applied.
     */
    applyTheme: function (themeName) {
        //console.log(`applying variable values of theme or view: ${themeName}`);

        // first set light or dark base values
        if (themeName != 'root' && themeName != 'view-light' && themeName != 'view-dark')
            this.applyTheme(this.themeBaseDark ? 'view-dark' : 'view-light');

        if (!themeName) {
            console.warn(`cannot apply styles, themeName was empty`);
            return false;
        }
        const theme = this.baseCss.get(themeName);
        if (!theme) {
            console.warn(`no theme with name "${themeName}" found to apply.`);
            return false;
        }
        const setAsBaseValues = themeName === 'root' || themeName === 'view-light' || themeName === 'view-dark';
        theme.forEach((v, k) => {
            const varInfo = this.variableInfo.get(k);
            if (varInfo)
                varInfo.setValue(v, setAsBaseValues);
        });

        this.setBackgroundImageExplicitly();
        return true;
    },

    /**
     * Applies the base values of a view, i.e. it does not change the set values, only the value a variable can be reset to. This has an effect on if a variable is saved or not, if it's equal to its base.
     * @param {string} viewName view-light or view-dark
     */
    applyThemeAsBase: function (viewName) {
        if (viewName != 'view-light' && viewName != 'view-dark') return;
        const theme = this.baseCss.get(viewName);
        if (!theme) {
            console.warn(`no view with name "${viewName}" found to apply.`);
            return;
        }

        theme.forEach((v, k) => {
            const varInfo = this.variableInfo.get(k);
            if (varInfo)
                varInfo.setBaseValue(v);
        });

        this.setBackgroundImageExplicitly();
    },

    /**
     * Reads the variable values of the currently selected theme by the wiki theme-selector
     * and applies the variable values to the editor variables.
     */
    applyValuesOfCurrentPageTheme() {
        // get styles of theme selector
        const themeStyleEl = document.getElementById('mw-themetoggle-styleref');
        if (!themeStyleEl) {
            console.warn('theme selector style element with id mw-themetoggle-styleref not found. Cannot apply theme selector styles.');
            return;
        }

        const sheetRules = themeStyleEl.sheet.cssRules;
        if (!sheetRules) {
            console.warn('theme selector styles not found in (mw-themetoggle-styleref).sheet.cssRules not found. Cannot apply theme selector styles.');
            return;
        }

        // clear editor style element so current wiki theme styles are valid and can be read
        const tceStylesElement = document.getElementById('tcolor-editor-styles');
        if (tceStylesElement && tceStylesElement.sheet.length > 0)
            tceStylesElement.sheet.deleteRule(0);

        const sheetRulesArray = [];
        for (let i = 0; i < sheetRules.length; i++) {
            const sr = sheetRules[i];
            if (sr.selectorText && (sr.selectorText.includes(':root') || sr.selectorText.includes('html')))
                sheetRulesArray.push(sr);
        }

        // first collect values without updating it
        const varValues = new Map();
        this.variableInfo.forEach(v => {
            let varValue = '';
            sheetRulesArray.forEach(sr => {
                const varValueRule = sr.style.getPropertyValue(v.name);
                if (varValueRule) varValue = varValueRule;
            });
            if (varValue)
                varValues.set(v.name, varValue);
        });

        if (varValues.length == 0) {
            console.warn('the theme selector element with id mw-themetoggle-styleref did not contain any values for the used variables.');
            return;
        }

        if (tceStylesElement) {
            // When selecting a theme of an external file, a new head element may be added where the styles are loaded.
            // Make sure the styles of this editor are the last style element.
            document.head.appendChild(tceStylesElement);
            tceStylesElement.sheet.insertRule(':root {}'); // re add previously deleted rule
            this.pageRules = tceStylesElement.sheet.cssRules[0].style;
        }
        this.previewPopups.forEach(p => {
            const styleElement = p.w.document.getElementById('tcolor-editor-styles');
            if (styleElement)
                styleElement.remove();
            p.s = this.addPreviewStyleElement(p.w.document);
        });

        // update variable values
        this.variableInfo.forEach(v => {
            const varValue = varValues.get(v.name);
            if (varValue)
                v.setValue(varValue);
        });

        // update background if it was changed by the theme
        this.setBackgroundImageExplicitly();
    },

    /**
     * Set the background-image property of the body element explicitly to its calculated value.
     * Usually the background-image is set via a variable (e.g. --wiki-body-background-image).
     * Setting the value explicitly will prevent flickering of the background-image if color variables are adjusted in a high frequency and a preview window is opened.
     * @param {window} win 
     * @param {string} backgroundStyle 
     */
    setBackgroundImageExplicitly: function () {
        document.body.style.removeProperty('background'); // remove previously explicitly set property
        const computedBodyBackground = getComputedStyle(document.body).background;
        if (computedBodyBackground.includes('url')) {
            document.body.style.setProperty('background', computedBodyBackground);
            this.previewPopups.forEach((p) => p.w.document.body.style.setProperty('background', computedBodyBackground));
        } else {
            this.previewPopups.forEach((p) => p.w.document.body.style.removeProperty('background'));
        }
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
        // adjust view the theme is based on (view-light or view-dark)
        // if variable --wiki-content-text-color is available, use that as indicator (dark text: view-light and vice versa)
        // if that variable is not existing, just toggle the view
        let useViewDark = undefined;
        const defaultVarTextColor = this.variableInfo.get('--wiki-content-text-color');
        if (defaultVarTextColor) {
            useViewDark = this.rgbToHsvSl(defaultVarTextColor.rgb)[4] > 50; // use dark-view if lightness of text color is larger than 50%
        } else {
            useViewDark = !this.themeBaseDark;
        }
        this.setThemeView(useViewDark);
        this.applyThemeAsBase(this.themeBaseDark ? 'view-dark' : 'view-light')
    },

    applyAllSuggestions: function () {
        this.variableInfo.forEach((v) => {
            v.setValueByDefinition();
        });
    },

    importStyles: function (useLightView) {
        const varMatches = Array.from(this.inOutTextarea.value.matchAll(/(--[-\w]+)\s*:\s*([^;]+)\s*;(?:[ \t]*\/\*[ \t]*\{([^}]+)\}[ \t]*\*\/)?/g));
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
                        let parsedNumber;
                        switch (optionMatch[1]) {
                            case 'saveExplicitRgbInOutput':
                                options.set('saveExplicitRgbInOutput', !!optionMatch[2]);
                                break;
                            case 'invert':
                                options.set('optionInvert', !!optionMatch[2]);
                                break;
                            case 'hueRotate':
                                parsedNumber = parseFloat(optionMatch[2]);
                                if (isNaN(parsedNumber)) parsedNumber = 0;
                                options.set('optionHueRotate', parsedNumber);
                                break;
                            case 'saturationFactor':
                                parsedNumber = parseFloat(optionMatch[2]);
                                if (isNaN(parsedNumber)) parsedNumber = 0;
                                options.set('optionSaturationFactor', parsedNumber);
                                break;
                            case 'lightnessFactor':
                                parsedNumber = parseFloat(optionMatch[2]);
                                if (isNaN(parsedNumber)) parsedNumber = 0;
                                options.set('optionLightnessFactor', parsedNumber);
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

            if (exportIncludeExplicitOptions) {
                // css output for saving theme definition
                varDefinitions.push(`${v.name}: ${v.value};` + (explicitDefinition ? ` /* {${explicitDefinition}} */` : ''));
            } else {
                // css ouput for wiki
                varDefinitions.push(`${v.name}: ${v.valueStringOutput()};`);
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
            timerId = setTimeout(() => functionToDebounce.apply(this, args), waitFor);
        }
    },
    //#endregion

    //#region controls
    addToolbar: function () {
        const toolBarElement = document.createElement('div');
        toolBarElement.className = 'tcolor-editor-toolbar tcolor-editor-control';
        document.body.appendChild(toolBarElement);

        // global color tools
        const divTools = this.createElementAndAdd('div', 'tcolor-editor-groupbox', toolBarElement);
        this.createElementAndAdd('span', 'tcolor-editor-groupbox-heading', divTools, null, 'global color tools');
        this.createElementAndAdd('span', 'tcolor-editor-toolbarText', divTools,
            'Select on which view the theme is based on (light or dark).\nThis has an effect whether a variable will be in the output or not\n(variables equal to their base value of the view will not be included in the output).',
            'theme based on');
        const viewToggleEl = this.createCheckbox('view-light',
            (e) => {
                this.setThemeView(e.target.checked);
                this.applyThemeAsBase(this.themeBaseDark ? 'view-dark' : 'view-light');
            },
            'view the theme is based on', true);
        divTools.appendChild(viewToggleEl);
        this.createElementAndAdd('div', 'tcolor-editor-separator', divTools);
        this.setThemeView = (viewDark = false) => {
            this.themeBaseDark = viewDark;
            viewToggleEl.firstChild.checked = viewDark; // viewToggleEl is label, firstChild is the input:checkbox
            viewToggleEl.lastChild.nodeValue = viewDark ? 'view-dark' : 'view-light';
        };
        let bt = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-full-width', divTools,
            'Inverts the lightness of all colors (switching dark <-> light)\nThe base view (dark or light theme) is also toggled. If that is not correct you can change that using the "rebase" button after setting the view toggle button.', 'invert all color\'s lightness');
        bt.addEventListener('click', () => this.invertAllLightness());
        bt = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-full-width', divTools,
            'Applies all suggested values to according values.\nThis affects usually black/white base colors and secondary colors dependant on other colors.\nThis can be done when starting a color theme, later it might overwrite changes you already made.',
            'apply all suggestions');
        bt.addEventListener('click', () => this.applyAllSuggestions());

        // theme loader
        const divThemeSelector = this.createElementAndAdd('div', 'tcolor-editor-groupbox', toolBarElement);
        this.createElementAndAdd('span', 'tcolor-editor-groupbox-heading', divThemeSelector, null, 'themes');
        this.themeBaseSelector = this.createElementAndAdd('select', null, divThemeSelector);
        bt = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-full-width', divThemeSelector,
            'Sets all variables to the values of the selected theme or view in the select control above.', 'load theme variables');
        bt.addEventListener('click', () => this.applyTheme(this.themeBaseSelector.options[this.themeBaseSelector.selectedIndex].text));
        this.createElementAndAdd('div', 'tcolor-editor-separator', divThemeSelector);
        bt = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-full-width', divThemeSelector,
            'Load all variables of the currently selected wiki theme (using the wiki theme-selector at the top of the page).\nIt is recommended to do this after loading a theme from a separate file with the theme-selector.\nThis will not reset initially indirect defined values.\nTo do this consider loading a base view (light or dark) first.',
            'load wiki theme variables');
        bt.addEventListener('click', () => this.applyValuesOfCurrentPageTheme());

        // import export
        const divImportExport = this.createElementAndAdd('div', 'tcolor-editor-groupbox', toolBarElement);
        this.createElementAndAdd('span', 'tcolor-editor-groupbox-heading', divImportExport, null, 'import/export css');
        divImportExport.appendChild(this.createCheckbox('include --rgb',
            (e) => { this.exportIncludeRgbVariants = e.target.checked; },
            'Include --rgb color variables for variables that have them.'));
        this.createElementAndAdd('br', null, divImportExport);
        divImportExport.appendChild(this.createCheckbox('include explicit adjustments',
            (e) => { this.exportIncludeExplicitOptions = e.target.checked; },
            'Include color options set for explicit color adjustments (e.g. invert, hue-rotate).\nThis should be only enabled if you want to save your work and import later.\nThis should not be enabled to export the css for use on a wiki.'));
        const inOutButton = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-full-width', divImportExport, null, 'input output view toggle');
        inOutButton.addEventListener('click', () => this.inOutStyleSheetEl.classList.toggle('transition-hide'));
        bt = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-full-width', divImportExport, null, 'copy styles to clipboard');
        bt.addEventListener('click', () => navigator.clipboard.writeText(this.exportStyles(true)));
        // in out element
        this.inOutStyleSheetEl = this.createElementAndAdd('div', 'tcolor-editor-control tcolor-editor-center-popup transition-show transition-hide', document.body);
        this.createElementAndAdd('div', null, this.inOutStyleSheetEl, null, 'css import/export');
        bt = this.createElementAndAdd('div', 'tcolor-editor-close-button', this.inOutStyleSheetEl, null, '×');
        bt.addEventListener('click', (e) => e.target.parentElement.classList.toggle('transition-hide', true));
        this.inOutTextarea = this.createElementAndAdd('textarea', null, this.inOutStyleSheetEl, null, null, { 'rows': '20', 'cols': '106' });
        const buttonContainer = this.createElementAndAdd('div', null, this.inOutStyleSheetEl);
        const btImportLight = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-button-light tcolor-editor-inline', buttonContainer, null, '↷import with light-view as base');
        btImportLight.addEventListener('click', () => this.importStyles(true));
        const btImportDark = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-inline', buttonContainer, null, '↷import with dark-view as base');
        btImportDark.addEventListener('click', () => this.importStyles(false));
        const btExport = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-inline', buttonContainer, null, '⮍replace text above with current theme definitions');
        btExport.addEventListener('click', () => this.exportStyles());

        // live preview controls
        const divPreview = this.createElementAndAdd('div', 'tcolor-editor-groupbox', toolBarElement);
        this.createElementAndAdd('span', 'tcolor-editor-groupbox-heading', divPreview, null, 'live preview');
        let previewPageSavedValue = localStorage.getItem('tcolor-editor-preview-page-name');
        if (!previewPageSavedValue) previewPageSavedValue = '';
        const previewPageEl = this.createElementAndAdd('input', null, divPreview, 'Enter the name of a wiki page for a live preview of the set colors\nE.g. "Wood", "Main Page" or "Wood?diff=prev&oldid=6699"', 'preview', {
            'type': 'text', 'placeholder': 'Wiki page name', 'id': 'tcolor-editor-preview-page-name',
            'value': previewPageSavedValue
        });
        previewPageEl.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') this.openPreviewWindow();
        });
        bt = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-full-width', divPreview, null, 'preview popup');
        bt.addEventListener('click', () => this.openPreviewWindow());
        bt = this.createElementAndAdd('button', 'tcolor-editor-button', divPreview, 'set default popup screen location and size', 'remember popup loc');
        bt.addEventListener('click', () => this.saveDefaultPopupLocation());

        // shortManual
        const shortManual = this.createElementAndAdd('div', 'tcolor-editor-control tcolor-editor-center-popup transition-show transition-hide', document.body);
        bt = this.createElementAndAdd('div', 'tcolor-editor-close-button', shortManual, null, '×');
        bt.addEventListener('click', (e) => e.target.parentElement.classList.toggle('transition-hide', true));
        const manualButton = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-full-width', toolBarElement, 'toggle display of short manual', '?', null, 'align-self: flex-start;');
        manualButton.addEventListener('click', () => shortManual.classList.toggle('transition-hide'));
        this.createElementAndAdd('div', null, shortManual, null, `<h2>Short Manual</h2>
        <ul>
            <li>if themes all saved in common.css</li>
            <ul>
                <li>In toolbar toggle to light or dark view</li>
                <li>In toolbar select and load theme the new theme is based on</li>
            </ul>
            <li>if themes saved in separate files</li>
            <ul>
                <li>In toolbar toggle to light or dark view</li>
                <li>In theme-selector (top right) select theme the new theme is based on</li>
            </ul>
            <li>Adjust colors by clicking on them, make sure contrasts are fulfilled</li>
            <li>Make use of indirect definitions to simplify color adjustments (export indirect definitions by enabling &quot;include explicit adjustments&quot;)</li>
            <li>Export theme to save in common.css or theme-page</li>
            <ul>
                <li>if wiki styling uses --rgb variables, make sure to enable the checkbox</li>
                <li>if indirect definitions should be exported, enable &quot;include explicit adjustments&quot; checkbox.<br/>Enable that only for saving a theme for later, this option should be disabled when saving for wiki styles.</li>
                <li>export themes directly to clipboard via button or view in export window</li>
            </ul>
        </ul>
            `);
    },
    //#endregion

    /**
     * Contains info about a css variable.
     */
    VariableInfo: class {
        constructor(varName) {
            this.name = varName;
            this.colorChangedThrottled = themeColorEditor.throttle(this.colorChanged, 20);
        }

        // class fields are not supported in ES6, so I'll comment them out but leave them for documentary reasons.
        //name;

        /**
         * Value of this variable, e.g. an explicit color or reference to another variable.
         */
        //value;

        /**
         * The current explicit color of this variable in a number[], each channel as byte in the range [0,255].
         */
        //rgb;

        /**
         * If true there's also a variable variant with the output as decimal numbers separated by a comma, e.g. '10,255,8'.
         * When saving this variable another var with that info is saved suffixed with --rgb
         */
        //hasFormatRgb;

        /**
         * Base color (number[], rgb) if theme variable is not set.
         */
        //baseColor;

        /**
         * Base value if this theme variable is not set.
         * Before saving, check if the set value is equal to this,
         * then optionally don't save the variable at all since it's redundant in the context.
         */
        //baseValue;

        /**
         * Suggested values of this color. If defined it is an object with either a property indirect or explicit colors in the properties light and dark.
         */
        //suggestedValue;

        /**
         * Indirect definition of this variable in a string, e.g. equal to other color like 'var(--other-var)' or mix 'color-mix(in srgb, #123, #f00)'
         */
        //_indirectDefinition;

        /**
         * Enables the indirect definition given in this.dependsOnVarsEl.value, or disables it (without deleting the string value).
         * @param {boolean} enable
         */
        enableIndirectDefinition(enable) {
            if (enable) {
                this.colorExplicitEl.style.backgroundColor = this.dependsOnVarsEl.value;
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
            const useIndirectDefinition = !!v;
            // if the indirectDefinition should be updated and this.useIndirectDefinition is already true
            // trigger the update manually (the property won't be changed in this case and the updating is not triggered)
            const updateValueFromDefinition = useIndirectDefinition && this.useIndirectDefinition && this._indirectDefinition !== v;
            this.dependsOnVarsEl.value = useIndirectDefinition ? v : '';
            this._indirectDefinition = v;
            this.useIndirectDefinition = useIndirectDefinition;
            if (updateValueFromDefinition) {
                this.enableIndirectDefinition(true);
                this.updateDependencyVariables();
                this.updateValueFromAffectors();
            }
            if (useIndirectDefinition)
                this.setColor(this.getCalculatedColorRgb(), alsoSetAsBase, true);
            this.saveExplicitRgbInOutput = false;
        }

        /**
         * updates the variables this variable depends on. Call after changing indirectDefinitions.
         */
        updateDependencyVariables() {
            if (!this._indirectDefinition || !this.useIndirectDefinition) {
                this.dependsOnVars = null;
                return;
            }

            const variables = [];
            const variableNameMatches = this._indirectDefinition.matchAll(/var\((--[-\w]+)\)/g);
            variableNameMatches.forEach((vn) => {
                const varInfo = themeColorEditor.variableInfo.get(vn[1]);
                if (varInfo)
                    variables.push(varInfo);
            });

            this.dependsOnVars = variables.length > 0 ? variables : null;
        }

        /**
         * Array of variables this one depends on, i.e. the variables that appear in this._indirectDefinition
         */
        //_dependsOnVars;

        /**
         * Array of variables this one depends on.
         */
        set dependsOnVars(v) {
            let removeDependsOnVars = this._dependsOnVars ? [...this._dependsOnVars] : [];

            if (!v) this._dependsOnVars = null;
            else {
                this._dependsOnVars = [...v];
                this._dependsOnVars.forEach((sourceVar) => {
                    if (!sourceVar.affectsVars) sourceVar.affectsVars = [this];
                    else if (!sourceVar.affectsVars.includes(this)) sourceVar.affectsVars.push(this);
                });
            }

            if (this._dependsOnVars)
                removeDependsOnVars = removeDependsOnVars.filter((v) => !this._dependsOnVars.includes(v));
            removeDependsOnVars.forEach((v) => {
                v.affectsVars = v.affectsVars ? v.affectsVars.filter((sv) => sv != this) : null;
            });
        }

        /**
         * Array of variables this one depends on.
         */
        get dependsOnVars() { return this._dependsOnVars; }

        /**
         * Text input for indirect color definition.
         */
        //dependsOnVarsEl;

        setDependsOnVarsElement(indirectDefinitionEl) {
            this.dependsOnVarsEl = indirectDefinitionEl;
            indirectDefinitionEl.addEventListener('change', (e) => { this.setValue(e.target.value); });
        }

        /**
         * Element where the color is shown.
         */
        //colorDisplayEl;

        /**
         * Element where the indirectly set color is set by other variables, used to further calculate indirect colors, invisible to the user.
         */
        //colorExplicitEl;

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
        //affectsVars;

        /**
         * Array of variables this variable needs to have a specific contrast to.
         */
        //contrastVariables;

        /**
         * List of other color contrast variables where this color is checked for contrast.
         * This is used to update the contrast checkers on these rows when this color is changed.
         */
        //contrastVariableOfOtherColors;

        /**
         * Element that shows if this color is different from the base definition
         */
        //elementEqualToBaseColor;

        /**
         * button to reset this color to the base definition
         */
        //elementResetToBaseValue;

        /**
         * 
         * @returns {boolean} true if the color is different from the base value and should be saved in the output
         */
        valueShouldGoInOutput() {
            return (this.saveExplicitRgbInOutput || !this.useIndirectDefinition || !this.value || this.value != this.baseValue)
                && !themeColorEditor.rgbEqual(this.rgb, this.baseColor);
        }

        /**
         * String value of variable value for export.
         */
        valueStringOutput() {
            return this.useIndirectDefinition && !this.saveExplicitRgbInOutput ? this.value : themeColorEditor.rgbToHexString(this.rgb);
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
        //customOnChangeFunction;

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
            if (!this.useIndirectDefinition || !this._dependsOnVars) return;
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

            if (themeColorEditor.rgbEqual(this.rgb, rgb)) {
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

        /**
         * Sets variable according to the passed definition which can have multiple properties.
         * This is usually a suggestion that has the property indirect or both explicit color definitions in the properties light and dark.
         * @param {object} definition 
         */
        setValueByDefinition(definition = undefined) {
            if (!definition) definition = this.suggestedValue;
            if (!definition) return;
            if (definition.light && !themeColorEditor.themeBaseDark) {
                this.setColor(themeColorEditor.parseColor(definition.light));
                return;
            }
            if (definition.dark && themeColorEditor.themeBaseDark) {
                this.setColor(themeColorEditor.parseColor(definition.dark));
                return;
            }
            if (!definition.indirect) return;

            this.setValue(definition.indirect);
            // color adjustments
            this.saveExplicitRgbInOutput = definition.invert !== undefined || definition.hueRotate != undefined || definition.saturationFactor != undefined || definition.lightnessFactor != undefined;
            this.optionInvert = definition.invert !== undefined ? !!definition.invert : false;
            this.optionHueRotate = definition.hueRotate !== undefined ? definition.hueRotate : 0;
            this.optionSaturationFactor = definition.saturationFactor !== undefined ? definition.saturationFactor : 1;
            this.optionLightnessFactor = definition.lightnessFactor !== undefined ? definition.lightnessFactor : 1;
        }

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
                this.elementEqualToBaseColor.title = `This color is equal to the base style.\nThe variable will not be included in the output.\nThis color: rgb(${this.rgb[3] == 1 ? this.rgb.slice(0, 3) : this.rgb}), ${themeColorEditor.rgbToHexString(this.rgb)}`;
            } else {
                this.elementEqualToBaseColor.style.backgroundColor = '#ffff41';
                this.elementEqualToBaseColor.title = `This color is different to the base definition.
The variable will be included in the output.
This color: rgb(${this.rgb[3] == 1 ? this.rgb.slice(0, 3) : this.rgb}), ${themeColorEditor.rgbToHexString(this.rgb)}
Base color: rgb(${this.baseColor}), ${themeColorEditor.rgbToHexString(this.baseColor)}
Base definition: ${this.baseValue}`;
            }

            this.elementResetToBaseValue.style.visibility = colorEqualToBase ? 'hidden' : 'visible';
        }
    },

    /**
     * Representing a contrast color in a color row with needed min contrast to row color.
     */
    ContrastVariableInfo: class {
        //variableName;
        //variable;
        /**
         * The color the contrast is calculated to (i.e. the main color of the row)
         */
        //contrastColorRgb;
        //contrast;
        //contrastDisplayElement;
        //minContrast;
        //elementResetToBaseValue;

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
            if (!this.variable.rgb) {
                console.warn(`variable ${this.variable.name} has no rgb`);
                return;
            }
            if (rgb) {
                this.contrastColorRgb = [...rgb];
            }

            this.contrast = themeColorEditor.colorContrast(this.variable.rgb, this.contrastColorRgb);
            if (this.contrast === undefined || this.contrastDisplayElement === null) return;
            this.contrastDisplayElement.innerHTML = (Math.floor(this.contrast * 10) / 10).toFixed(1) + '<small>:1</small>';
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
            const alphaContrastRestriction = this.variable.rgb[3] < 1 || this.contrastColorRgb[3] < 1 ? '\nThe colors have reduced alpha. The contrast indicator tries to approximate the effect of that, but the exact effect depends on the context where the color is used.\nThe displayed contrast ratio may not be correct.' : '';
            this.contrastDisplayElement.setAttribute('title', (sufficientContrast ? 'sufficient contrast' : 'contrast not sufficient') + `, needed contrast is at least ${this.minContrast}:1${alphaContrastRestriction}`);

            const buttonFixContrast = this.elementFixContrast;
            buttonFixContrast.style.visibility = sufficientContrast ? 'hidden' : 'visible';
            buttonFixContrast.classList.toggle('contrast-color-indirectly-defined', this.variable.useIndirectDefinition);
            buttonFixContrast.setAttribute('title', 'Tries to fix the contrast issues by changing the lightness of the variable ' + this.variable.name + (this.variable.useIndirectDefinition ? '\nCaution! This variable is indirectly defined. Using this button will save the color explicitly.' : ''));

            this.elementResetToBaseValue.style.visibility = themeColorEditor.rgbEqual(this.variable.rgb, this.variable.baseColor) ? 'hidden' : 'visible';
        }
    },

    ColorPicker: class {
        //rgb = [];
        /**
         * [h, s_hsv, v, s_hsl, l]
         */
        //hsvSl = [];
        //_container;
        //
        //_colorPreviewEl;
        //_hSlider;
        //_sHsvSlider;
        //_vSlider;
        //_sHslSlider;
        //_lSlider;
        //_rSlider;
        //_gSlider;
        //_bSlider;
        //_aSlider;
        //_hInput;
        //_sHsvInput;
        //_vInput;
        //_sHslInput;
        //_lInput;
        //_rInput;
        //_gInput;
        //_bInput;
        //_aInput;
        //_titleTextEl;
        //_hexInputEl;
        //_currentColorVariable;
        get currentColorVariable() { return this._currentColorVariable; }

        constructor(elementToAppend) {
            this.updatePreviewThrottled = themeColorEditor.throttle(() => {
                if (!this.rgb || isNaN(this.rgb[0])) return;

                this._colorPreviewEl.style.background = themeColorEditor.rgbToHexString(this.rgb);

                // calculate min max values for slider background linear-gradients
                const colorSHsvMin = themeColorEditor.hsvToRgb([this.hsvSl[0], 0, this.hsvSl[2]]);
                const colorSHsvMax = themeColorEditor.hsvToRgb([this.hsvSl[0], 100, this.hsvSl[2]]);
                const colorVMin = themeColorEditor.hsvToRgb([this.hsvSl[0], this.hsvSl[1], 0]);
                const colorVMax = themeColorEditor.hsvToRgb([this.hsvSl[0], this.hsvSl[1], 100]);

                const rgbString = themeColorEditor.rgbToHexString(this.rgb.slice(0, 3)); // ignore alpha
                // hsv
                this._sHsvSlider.style.background = `linear-gradient(to right, rgb(${[...colorSHsvMin]}), rgb(${[...colorSHsvMax]}))`;
                this._vSlider.style.background = `linear-gradient(to right, rgb(${[...colorVMin]}), rgb(${[...colorVMax]}))`;
                this._hSlider.style.setProperty('--custom-slider-background-color', `hsl(${this.hsvSl[0]} 100 50)`);
                this._sHsvSlider.style.setProperty('--custom-slider-background-color', rgbString);
                this._vSlider.style.setProperty('--custom-slider-background-color', rgbString);

                // hsl
                const hsl = [this.hsvSl[0], this.hsvSl[3], this.hsvSl[4]];
                this._sHslSlider.style.background = `linear-gradient(to right, hsl(${hsl[0]} 0 ${hsl[2]}), hsl(${hsl[0]} 100 ${hsl[2]}))`;
                this._lSlider.style.background = `linear-gradient(in hsl to right, hsl(${hsl[0]} ${hsl[1]} 0), hsl(${hsl[0]} ${hsl[1]} 50), hsl(${hsl[0]} ${hsl[1]} 100))`;
                this._sHslSlider.style.setProperty('--custom-slider-background-color', rgbString);
                this._lSlider.style.setProperty('--custom-slider-background-color', rgbString);

                // rgb
                this._rSlider.style.background = `linear-gradient(to right, rgb(0, ${this.rgb[1]}, ${this.rgb[2]}), rgb(255, ${this.rgb[1]}, ${this.rgb[2]}))`;
                this._rSlider.style.setProperty('--custom-slider-background-color', `rgb(${this.rgb[0]}, 0, 0)`);
                this._gSlider.style.background = `linear-gradient(to right, rgb(${this.rgb[0]}, 0, ${this.rgb[2]}), rgb(${this.rgb[0]}, 255, ${this.rgb[2]}))`;
                this._gSlider.style.setProperty('--custom-slider-background-color', `rgb(0, ${this.rgb[1]}, 0)`);
                this._bSlider.style.background = `linear-gradient(to right, rgb(${this.rgb[0]}, ${this.rgb[1]}, 0), rgb(${this.rgb[0]}, ${this.rgb[1]}, 255))`;
                this._bSlider.style.setProperty('--custom-slider-background-color', `rgb(0, 0, ${this.rgb[2]})`);

                // alpha
                this._aSlider.style.background = `linear-gradient(to right, transparent, rgb(${this.rgb[0]}, ${this.rgb[1]}, ${this.rgb[2]})), repeating-conic-gradient(#777 0% 25%, white 0% 50%) center/10px 10px`;
                const alpha = this.rgb[3];
                if (alpha === undefined) console.warn(`no alpha when updating alpha controls`);
                this._aSlider.style.setProperty('--custom-slider-background-color', `rgb(${Math.round(this.rgb[0] * alpha + 255 * (1 - alpha))}, ${Math.round(this.rgb[1] * alpha + 255 * (1 - alpha))}, ${Math.round(this.rgb[2] * alpha + 255 * (1 - alpha))})`);

                if (document.activeElement != this._hexInputEl)
                    this._hexInputEl.value = themeColorEditor.rgbToHexString(this.rgb, false);

                if (this._currentColorVariable)
                    this._currentColorVariable.setColor(this.rgb);
            }, 50);

            this._container = document.createElement('div');
            this._container.className = 'tcolor-editor-color-picker-container tcolor-editor-control transition-show transition-hide';

            let bt = themeColorEditor.createElementAndAdd('div', 'tcolor-editor-close-button', this._container, null, '×');
            bt.addEventListener('click', () => { themeColorEditor.editColorInColorPicker(null) });
            this._titleTextEl = themeColorEditor.createElementAndAdd('div', null, this._container, null, null, { 'id': 'color-picker-title' }, 'margin: 0.4rem;');
            const colorPreviewContainer = themeColorEditor.createElementAndAdd('div', null, this._container, null, null, null, 'height: 50px; border: 1px solid #000; border-radius: 5px; background: repeating-conic-gradient(#777 0% 25%, white 0% 50%) center/10px 10px');
            this._colorPreviewEl = themeColorEditor.createElementAndAdd('div', null, colorPreviewContainer, null, null, { 'id': 'color-preview' }, 'height: 100%; border-radius: 5px;');

            // hex input and slider toggle
            const hexFrame = themeColorEditor.createElementAndAdd('div', 'color-picker-frame', this._container);
            const lbHexInput = themeColorEditor.createElementAndAdd('label', null, hexFrame, null, '# ');
            this._hexInputEl = themeColorEditor.createElementAndAdd('input', null, lbHexInput, null, null, { 'type': 'text', 'pattern': '[\\da-fA-F]{3,8}', 'minlength': '3', 'maxlength': '8', 'size': '8' });
            this._hexInputEl.addEventListener('input', (e) => this.setColorAndSetControls(themeColorEditor.hexToRgb(e.target.value, false)));

            // view toggle checkboxes
            function addSliderToggleCheckBox(name, sliderIds) {
                const lb = themeColorEditor.createCheckbox(name,
                    function () {
                        ids.forEach((id) => {
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
            addSliderToggleCheckBox('alpha', ['a']);

            // slider
            function addColorSlider(container, name, id, updateCallback, max, min = 0, styleRange = null, step = 1) {
                const cpFrame = themeColorEditor.createElementAndAdd('div', 'color-picker-frame', container, null, null, { 'id': 'theme-creator-color-picker-slider-' + id }, 'display: ' + (name == 'Hue' ? 'block' : 'none'));
                themeColorEditor.createElementAndAdd('label', null, cpFrame, null, name);
                const inputEl = themeColorEditor.createElementAndAdd('input', null, cpFrame, null, null, { 'type': 'number', 'min': min, 'max': max }, 'float: right;');
                const rangeEl = themeColorEditor.createElementAndAdd('input', 'custom-slider', cpFrame, null, null, { 'type': 'range', 'min': min, 'max': max }, styleRange);
                if (step != 1) {
                    inputEl.setAttribute('step', step);
                    rangeEl.setAttribute('step', step);
                }
                inputEl.addEventListener('input', () => {
                    if (rangeEl.value == inputEl.value) return;
                    rangeEl.value = inputEl.value;
                    updateCallback();
                });
                rangeEl.addEventListener('input', () => {
                    if (inputEl.value == rangeEl.value) return;
                    inputEl.value = rangeEl.value;
                    updateCallback();
                });
                return [inputEl, rangeEl];
            }

            const updateFromRgbControls = () => {
                this.setColorByRgb([parseInt(this._rInput.value), parseInt(this._gInput.value), parseInt(this._bInput.value)]);
                this._hInput.value = this._hSlider.value = this.hsvSl[0];
                this._sHsvInput.value = this._sHsvSlider.value = this.hsvSl[1];
                this._vInput.value = this._vSlider.value = this.hsvSl[2];
                this._sHslInput.value = this._sHslSlider.value = this.hsvSl[3];
                this._lInput.value = this._lSlider.value = this.hsvSl[4];
                this.updatePreviewThrottled();
            };
            const updateFromHsvControls = () => {
                this.setColorByHsv([parseInt(this._hInput.value), parseInt(this._sHsvInput.value), parseInt(this._vInput.value)]);
                this._sHslInput.value = this._sHslSlider.value = this.hsvSl[3];
                this._lInput.value = this._lSlider.value = this.hsvSl[4];
                this._rInput.value = this._rSlider.value = this.rgb[0];
                this._gInput.value = this._gSlider.value = this.rgb[1];
                this._bInput.value = this._bSlider.value = this.rgb[2];
                this.updatePreviewThrottled();
            };
            const updateFromHslControls = () => {
                this.setColorByHsl([parseInt(this._hInput.value), parseInt(this._sHslInput.value), parseInt(this._lInput.value)]);
                this._sHsvInput.value = this._sHsvSlider.value = this.hsvSl[1];
                this._vInput.value = this._vSlider.value = this.hsvSl[2];
                this._rInput.value = this._rSlider.value = this.rgb[0];
                this._gInput.value = this._gSlider.value = this.rgb[1];
                this._bInput.value = this._bSlider.value = this.rgb[2];
                this.updatePreviewThrottled();
            };
            const updateFromAlphaControl = () => {
                this.rgb[3] = parseFloat(this._aInput.value);
                this.updatePreviewThrottled();
            };

            [this._hInput, this._hSlider] = addColorSlider(this._container, 'Hue', 'h', updateFromHsvControls, 360, 0, 'background: linear-gradient(to right,hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%));');
            [this._sHsvInput, this._sHsvSlider] = addColorSlider(this._container, 'Saturation (hsv)', 's_hsv', updateFromHsvControls, 100);
            [this._vInput, this._vSlider] = addColorSlider(this._container, 'Value', 'v', updateFromHsvControls, 100);
            [this._sHslInput, this._sHslSlider] = addColorSlider(this._container, 'Saturation (hsl)', 's_hsl', updateFromHslControls, 100);
            [this._lInput, this._lSlider] = addColorSlider(this._container, 'Lightness', 'l', updateFromHslControls, 100);
            [this._rInput, this._rSlider] = addColorSlider(this._container, 'R', 'r', updateFromRgbControls, 255);
            [this._gInput, this._gSlider] = addColorSlider(this._container, 'G', 'g', updateFromRgbControls, 255);
            [this._bInput, this._bSlider] = addColorSlider(this._container, 'B', 'b', updateFromRgbControls, 255);
            [this._aInput, this._aSlider] = addColorSlider(this._container, 'Alpha', 'a', updateFromAlphaControl, 1, 0, null, 0.01);

            this.toggleDisplay(false);
            elementToAppend.append(this._container);
        }

        setColorByHsv(hsv) {
            this.rgb = themeColorEditor.hsvToRgb(hsv, this.rgb ? this.rgb[3] : 1);
            this.hsvSl = themeColorEditor.rgbToHsvSl(this.rgb);
        };

        setColorByHsl(hsl) {
            this.rgb = themeColorEditor.hslToRgb(hsl, this.rgb ? this.rgb[3] : 1);
            this.hsvSl = themeColorEditor.rgbToHsvSl(this.rgb);
        }

        setColorByRgb(rgb) {
            const a = this.rgb ? this.rgb[3] : 1;
            this.rgb = [...rgb];
            if (this.rgb.length < 4) this.rgb.push(a === undefined ? 1 : a);
            this.hsvSl = themeColorEditor.rgbToHsvSl(rgb);
        };

        setControlsAccordingToVariables() {
            this._rInput.value = this._rSlider.value = this.rgb[0];
            this._gInput.value = this._gSlider.value = this.rgb[1];
            this._bInput.value = this._bSlider.value = this.rgb[2];
            this._hInput.value = this._hSlider.value = this.hsvSl[0];
            this._sHsvInput.value = this._sHsvSlider.value = this.hsvSl[1];
            this._vInput.value = this._vSlider.value = this.hsvSl[2];
            this._sHslInput.value = this._sHslSlider.value = this.hsvSl[3];
            this._lInput.value = this._lSlider.value = this.hsvSl[4];
            this._aInput.value = this._aSlider.value = this.rgb[3];
            this.updatePreviewThrottled();
        }

        /**
         * Set VariableInfo that should be edited in the color picker.
         * @param {VariableInfo} colorVar 
         * @param {boolean} showColorPicker 
         */
        setColorVariable(colorVar, showColorPicker = true) {
            if (this._currentColorVariable)
                this._currentColorVariable.colorDisplayEl.classList.toggle('selected-color-cell', false);
            if (!colorVar || !colorVar.rgb) {
                console.warn(`color variable ${colorVar ? colorVar.name : '[no-name-available]'} didn't contain any rgb color info`);
                return;
            }
            this._currentColorVariable = colorVar;
            this._titleTextEl.innerHTML = colorVar.name;
            this.setColorAndSetControls(colorVar.rgb);
            if (showColorPicker)
                this.toggleDisplay(true);
        }

        updateColorIfVariableWasChangedOutside(varInfo) {
            if (!varInfo
                || varInfo != this._currentColorVariable
                || themeColorEditor.rgbEqual(varInfo.rgb, this.rgb))
                return;

            this.setColorAndSetControls(varInfo.rgb);
        }

        setColorAndSetControls(rgb) {
            if (!rgb || themeColorEditor.rgbEqual(this.rgb, rgb)) return;
            this.setColorByRgb(rgb);
            this.setControlsAccordingToVariables();
        }

        toggleDisplay(show) {
            this._container.classList.toggle('transition-hide', !show)
            if (!this._currentColorVariable) return;

            this._currentColorVariable.colorDisplayEl.classList.toggle('selected-color-cell', show);
            if (!show)
                this._currentColorVariable = null;
        }
    },

    /**
     * Parse color variable table on html site and add controls.
     */
    parseVariables: function () {
        // add onclick events on the color variable table cells
        const tables = document.querySelectorAll('table');

        tables.forEach((table) => {
            if (table.rows.length < 2 || table.rows[0].length < 3) return;
            // the color table contains "Variable name" in first cell
            if (table.rows[0].cells[0].textContent.trim() !== 'Variable name') return;
            const notesColumnIndex = Array.from(table.rows[0].cells).findIndex((c) => c.textContent == 'Notes');

            // set columns not too narrow
            table.rows[0].cells[0].style.minWidth = '18em';
            table.rows[0].cells[table.rows[0].cells.length - 1].style.minWidth = '25em';

            // add the controls to the color table
            // a color variable row is expected to have in that order (not necessarily consecutive)
            // * a cell containing only the color variable name
            // * a cell with no content and the color variable used for the background color
            // * a cell with a list of variable names that should have sufficient contrast
            Array.from(table.querySelectorAll('tr')).forEach((row) => {
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
        Array.from(row.querySelectorAll('td')).forEach((cell, columnIndex) => {
            const cellStyleBackgroundColor = cell.style.backgroundColor;

            // check if variable name cell
            if (!rowVariableName && /^--[\w-]+$/.test(cell.innerHTML.trim())) {
                rowVariableName = cell.innerHTML.trim();
                cell.innerHTML = '';
                cell.setAttribute('id', 'var-' + rowVariableName);
                const varTitle = this.createElementAndAdd('div', 'tcolor-editor-variable-title tcolor-editor-pointer', cell, 'click to edit', rowVariableName);
                const varName = rowVariableName;
                varTitle.addEventListener('click', () => {
                    this.editColorInColorPicker(varName);
                });
                rowVariableNameElement = cell;
            }

            // check if color display cell
            else if (rowVariableName && 'var(' + rowVariableName + ')' === cellStyleBackgroundColor
                && cell.textContent.trim() == '' && !rowVariableInfo) {
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
                Array.from(cell.querySelectorAll('code')).forEach((codeVarEl) => { this.addVariableLink(codeVarEl, true); });
                this.applyCustomWarnings(cell, rowVariableInfo);
            } else
                // check if cell with contrast variable names (and nothing else)
                if (rowVariableInfo && /^\s*(?:--[\w-]+\s*)+$/.test(cell.textContent)) {
                    const contrastTable = this.createElementAndAdd('div', 'tcolor-editor-table', cell);
                    Array.from(cell.querySelectorAll('span')).forEach((spanVar) => {

                        const contrastVarNameMatch = spanVar.textContent.match(/--[\w-]+/);
                        if (!contrastVarNameMatch) return;
                        const contrastVarName = contrastVarNameMatch[0];

                        // at this point the variableInfo objects are not yet all in the map variableInfo
                        // so save only the var names for now and set the actual objects later.

                        const contrastElement = this.createElementAndAdd('span', 'tcolor-editor-contrast-indicator');
                        const contrastVariableInfo = new this.ContrastVariableInfo(contrastVarName, contrastElement)

                        contrastVariableInfo.minContrast = spanVar.dataset.minContrast !== undefined ? spanVar.dataset.minContrast : 4.5; // if not specified use default min contrast of 4.5 (value for normal text in WCAG 2.0)

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
                            const contrastRow = this.createElementAndAdd('div', 'tcolor-editor-table-row', contrastTable);
                            const contrastCell1 = this.createElementAndAdd('div', 'tcolor-editor-table-cell', contrastRow);
                            contrastCell1.appendChild(contrastElement);

                            this.createElementAndAdd('div', 'tcolor-editor-contrast-visualizer', contrastCell1, 'contrast visualizer', '◉▩', null, 'color: var(' + contrastVarName + ')');

                            // luminance adjust button to get needed contrast
                            contrastVariableInfo.elementFixContrast = this.createElementAndAdd('span', 'tcolor-editor-button tcolor-editor-inline', contrastCell1, null, '◐');
                            contrastVariableInfo.elementFixContrast.addEventListener('click', () => this.fixContrastWithLightness(contrastVariableInfo.variable, new this.ContrastVariableInfo(rowVariableInfo, contrastVariableInfo.minContrast)));

                            // reset value
                            contrastVariableInfo.elementResetToBaseValue = this.createElementAndAdd('span', 'tcolor-editor-button tcolor-editor-inline', contrastCell1, 'Resets color to base value.', '⭯');
                            contrastVariableInfo.elementResetToBaseValue.addEventListener('click', () => {
                                if (contrastVariableInfo.variable)
                                    contrastVariableInfo.variable.resetToBase();
                            });

                            if (spanVar.nextElementSibling && spanVar.nextElementSibling.tagName === 'BR')
                                spanVar.nextElementSibling.remove();

                            const contrastCell2 = this.createElementAndAdd('div', 'tcolor-editor-table-cell', contrastRow);
                            contrastCell2.appendChild(spanVar);
                            this.addVariableLink(spanVar);
                        }
                    });

                    if (contrastTable.previousElementSibling
                        && contrastTable.previousElementSibling.tagName === 'P'
                        && contrastTable.previousElementSibling.childElementCount === 0)
                        contrastTable.previousElementSibling.remove();
                }
        });
    },

    /**
     * Sets the initial values of all variables depending on the currently selected theme.
     */
    initializeVariables: function () {
        this.setThemeView(document.documentElement.classList.contains('view-dark'));
        const useThemeName = document.documentElement.className.split(' ').find((c) => c.startsWith('theme-'));
        // apply current theme variables. If loaded from file, use the definitions of the theme-selector element
        if (!this.applyTheme(useThemeName) && useThemeName)
            this.applyValuesOfCurrentPageTheme();

        const rootStyles = this.baseCss.get('root');

        // set for each var which they do affect, the actual color as byte[] and the contrast var objects
        this.variableInfo.forEach((v) => {
            // if variable has rgb variant, add property
            const variableRgbName = v.name + '--rgb';
            v.hasFormatRgb = rootStyles.has(variableRgbName) && !this.variableInfo.has(variableRgbName);

            // set dependency of --inverse color variables
            if (v.name.length > 9 && v.name.substring(v.name.length - 10) == '--inverted') {
                const varInfo = this.variableInfo.get(v.name.substring(0, v.name.length - 10));
                const sourceVarName = varInfo ? varInfo.name : null;
                if (sourceVarName) {
                    v.setValue(`var(${sourceVarName})`);
                    v.optionInvert = true;
                    v.saveExplicitRgbInOutput = true;
                }
            }

            // if color needs checks for contrast, set variable objects using the variable names
            if (v.contrastVariables) {
                v.contrastVariables.forEach((contrastVariable) => {
                    contrastVariable.variable = this.variableInfo.get(contrastVariable.variableName);
                    if (!contrastVariable.variable) return;

                    if (contrastVariable.variable.contrastVariableOfOtherColors)
                        contrastVariable.variable.contrastVariableOfOtherColors.push(contrastVariable);
                    else contrastVariable.variable.contrastVariableOfOtherColors = [contrastVariable];

                    contrastVariable.UpdateContrast(v.rgb);
                });
            }
        });

        // add toc entries alphabetically sorted
        const tocElement = this.createElementAndAdd('div', 'tcolor-editor-control tcolor-editor-var-toc', document.body)
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
        const el = document.createElement(tagName);
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
        const label = this.createElementAndAdd('label', (className ? className + ' ' : '') + (toggleButton ? 'tcolor-editor-toggle-button' : 'tcolor-editor-checkbox'), null, title, labelText, null, 'white-space: nowrap');
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
            if (addToElement)
                addToElement.appendChild(inputContainer);
        }
        else if (inputType == 'number') {
            if (controlText) {
                inputContainer = this.createElementAndAdd('label', 'tcolor-editor-number-label', addToElement, titleText, controlText);
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
                    return propValue;
                },
                set: function (newValue) {
                    if (propValue === newValue) return;
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
    addVariableLink: function (el, addSplotch = false) {
        const varInfo = el.textContent.match(/^--[\w-]+$/);
        const varName = varInfo ? varInfo[0] : null;
        if (!varName) return;
        el.addEventListener('click', () => this.editColorInColorPicker(varName));
        el.classList.add('tcolor-editor-pointer');
        el.title += 'Click to edit color';

        const linkToVarWrapper = this.createElementAndAdd('span', 'tcolor-editor-link-to-var-wrapper');
        el.parentElement.insertBefore(linkToVarWrapper, el);
        const linkToVar = this.createElementAndAdd('a', 'tcolor-editor-button tcolor-editor-inline tcolor-editor-link-to-var', null, 'jump to color row', '↪', { 'href': '#var-' + varName });
        linkToVarWrapper.append(linkToVar, el);
        if (addSplotch) {
            this.createElementAndAdd('span', 'tcolor-editor-color-splotch', linkToVarWrapper, null, null, null, `background-color: var(${varName})`);
        }
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
        colorVariableInfo.elementEqualToBaseColor = this.createElementAndAdd('span', 'tcolor-editor-variable-changed-indicator', buttonContainer);
        colorVariableInfo.elementEqualToBaseColor.style.backgroundColor = 'gray';

        const hiddenSettingsContainer = this.createElementAndAdd('div', 'tcolor-editor-variable-hidden-settings', buttonContainer);
        let bt = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-inline', hiddenSettingsContainer, 'copy this variable value to paste it in other variables', 'copy');
        bt.addEventListener('click', (e) => { this.holdVariable = this.variableInfo.get(e.target.parentElement.parentElement.dataset.varName); });
        bt = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-inline', hiddenSettingsContainer, 'paste color value directly without dependency', 'paste value');
        bt.addEventListener('click', (e) => { this.setValueOfVariableByName(e.target.parentElement.parentElement.dataset.varName, this.holdVariable); });
        bt = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-inline', hiddenSettingsContainer, 'paste reference of copied variable, so this variable will adjust accordingly', 'paste ref');
        bt.addEventListener('click', (e) => { this.setValueOfVariableByName(e.target.parentElement.parentElement.dataset.varName, this.holdVariable, true); });
        bt = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-inline', hiddenSettingsContainer, 'paste reference of copied variable with relative adjustments.\nThis will keep the variable unchanged initially but it will adjust relatively to the source variable', 'paste ref rel');
        bt.addEventListener('click', (e) => { this.setValueOfVariableByName(e.target.parentElement.parentElement.dataset.varName, this.holdVariable, true, true); });

        bt = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-inline', buttonContainer, 'Tries to fix all the contrast issues of this variable to the colors in the contrast column in this row by changing the lightness of the var ' + colorVariableInfo.name, '◐');
        bt.addEventListener('click', (e) => { this.fixContrastWithLightness(this.variableInfo.get(e.target.parentElement.dataset.varName)); });
        bt = colorVariableInfo.elementResetToBaseValue = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-inline', buttonContainer, 'reset color to theme value', '⭯');
        bt.addEventListener('click', (e) => {
            const varInfo = this.variableInfo.get(e.target.parentElement.dataset.varName);
            if (varInfo)
                varInfo.resetToBase();
        });

        // suggestion button
        const suggestion = this.variableSuggestions[colorVariableInfo.name];
        if (suggestion) {
            colorVariableInfo.suggestedValue = suggestion;
            bt = this.createElementAndAdd('button', 'tcolor-editor-button tcolor-editor-inline', buttonContainer, 'set variable to default suggestion: ' + this.createSuggestionInfo(suggestion), '◈');
            bt.addEventListener('click', () => {
                colorVariableInfo.setValueByDefinition();
            });
        }

        this.createElementAndAdd('br', null, buttonContainer);
        this.addColorOptionControlAndBind('checkbox', 'use indirect definition',
            'use the indirect definition in the text input below for this color (will update automatically if the according colors change)',
            colorVariableInfo, 'useIndirectDefinition', buttonContainer);
        const indirectDefinitionEl = this.createElementAndAdd('input', null, buttonContainer, null, null, { 'type': 'text' }, 'width:100%;');
        colorVariableInfo.setDependsOnVarsElement(indirectDefinitionEl);

        let subContainer = this.createElementAndAdd('div', 'tcolor-editor-checkbox-subcontainer', buttonContainer);
        this.addColorOptionControlAndBind('checkbox', 'save explicit color output',
            'save the explicit color value in the css output instead of the indirect definition\nThis allows further automatic adjustments like inversion or hue rotation',
            colorVariableInfo, 'saveExplicitRgbInOutput', subContainer);

        subContainer = this.createElementAndAdd('div', 'tcolor-editor-checkbox-subcontainer', subContainer);
        //cbSaveExplicit.addEventListener('change', function () { subContainer.style.display = this.checked ? 'block' : 'none' });
        this.addColorOptionControlAndBind('checkbox', 'invert', 'invert the color', colorVariableInfo, 'optionInvert', subContainer);
        this.createElementAndAdd('br', null, subContainer);
        this.addColorOptionControlAndBind('number', ' hue rotation in deg (0-360)', 'hue rotation in degree (0: no change)', colorVariableInfo, 'optionHueRotate', subContainer, { 'size': '3', 'value': '0' });
        this.createElementAndAdd('br', null, subContainer);
        this.addColorOptionControlAndBind('number', ' saturation factor', 'saturation factor (1: no change)', colorVariableInfo, 'optionSaturationFactor', subContainer, { 'size': '3', 'value': '1', 'min': '0', 'step': '0.1' });
        this.createElementAndAdd('br', null, subContainer);
        this.addColorOptionControlAndBind('number', ' lightness factor', 'lightness factor (1: no change)', colorVariableInfo, 'optionLightnessFactor', subContainer, { 'size': '3', 'value': '1', 'min': '0', 'step': '0.1' });

        colorVarNameElement.classList.add('tcolor-editor-variable-name-container');
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
            const warningSpan = this.createElementAndAdd('span', 'tcolor-editor-warning', null, 'The variable is maybe too reddish', '⚠', null, 'display:none');
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
            const warningSpan = this.createElementAndAdd('span', 'tcolor-editor-warning', null, 'The variable should be maybe more reddish', '⚠', null, 'display:none');
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
            adjustedColor = this.hslToRgb([hsl[0], hsl[1], lightness], rgb[3]);
            diff = relativeLuminanceTarget - this.relativeLuminance(adjustedColor);
            if (Math.abs(diff) < maxDifference) {
                break;
            }
            if (diff > 0)
                minLightness = lightness;
            else
                maxLightness = lightness;
        }
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
        const rgb = color.slice(0, 3).map(v => {
            return Math.min(255, Math.round(v * lightnessFactor));
        });
        return [...rgb, rgb[3]];
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
     * Calculates the contrast between two colors using the relative luminance. Only approximation if alpha is < 1.
     * @param {number[]} rgb1 
     * @param {number[]} rgb2 
     * @returns 
     */
    colorContrast: function (rgb1, rgb2) {
        if (!rgb1 || !rgb2) return undefined;
        const relLum1 = this.relativeLuminance(rgb1);
        const relLum2 = this.relativeLuminance(rgb2);
        if (rgb1[3] == 1 && rgb2[3] == 1)
            return this.luminanceContrast(relLum1, relLum2);
        // approximation of effect of alpha on the contrast
        // the exact effect of the alpha depends on the context where the colors are used
        return this.luminanceContrast(relLum1 * rgb1[3] + relLum2 * (1 - rgb1[3]), relLum2 * rgb2[3] + relLum1 * (1 - rgb2[3]));
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
     * @param {boolean} pasteRelativeRef if true and pasteRef is true the variable referenced to the source variable while adding relative adjustments to keep the current color.
     * @returns 
     */
    setValueOfVariableByName: function (varName, variableSource, pasteRef = false, pasteRelativeRef = false) {
        if (!varName || !variableSource) return;
        const varInfo = this.variableInfo.get(varName);
        if (!varInfo) return;

        if (pasteRef) {
            if (pasteRelativeRef) {
                const hsvSlSource = this.rgbToHsvSl(variableSource.rgb);
                const hsvSlTarget = this.rgbToHsvSl(varInfo.rgb);
                varInfo.saveExplicitRgbInOutput = true;
                varInfo.optionHueRotate = hsvSlTarget[0] - hsvSlSource[0];
                varInfo.optionSaturationFactor = hsvSlSource[3] > 0 ? hsvSlTarget[3] / hsvSlSource[3] : 1;
                varInfo.optionLightnessFactor = hsvSlSource[4] > 0 ? hsvSlTarget[4] / hsvSlSource[4] : 1;
            } else {
                varInfo.optionHueRotate = 0;
                varInfo.optionSaturationFactor = 1;
                varInfo.optionLightnessFactor = 1;
            }
            varInfo.setValue(`var(${variableSource.name})`);
        }
        else { varInfo.setColor(variableSource.rgb); }
    },

    /**
     * Sets a new color for editing.
     * @param {string} varName
     * @param {HTMLElement} cell 
     */
    editColorInColorPicker: function (varName) {
        const currentVarName = this.colorPicker.currentColorVariable ? this.colorPicker.currentColorVariable.name : null;
        if (!varName || currentVarName == varName) {
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
        if (!variable || !variable.rgb) return;
        const varValue = variable.valueStringOutput();
        // if variable has rgb variant, also save that
        const varValueRgb = variable.hasFormatRgb ? variable.valueColorAsCommaRgbString() : null;
        // if variable is link color, also set icon-to-link-filter value
        const iconLinkFilter = variable.name === '--wiki-content-link-color' ? this.filterCreator.calculateFilter(variable.rgb).filterString : null;

        if (varValue)
            this.pageRules.setProperty(variable.name, varValue);
        if (varValueRgb)
            this.pageRules.setProperty(variable.name + '--rgb', varValueRgb);
        if (iconLinkFilter)
            this.pageRules.setProperty('--wiki-icon-to-link-filter', iconLinkFilter);

        // update variable on previews
        this.previewPopups.forEach((p) => {
            if (p.w.closed) return;
            if (varValue)
                p.s.setProperty(variable.name, varValue);
            if (varValueRgb)
                p.s.setProperty(variable.name + '--rgb', varValueRgb);
            if (iconLinkFilter)
                p.s.setProperty('--wiki-icon-to-link-filter', iconLinkFilter);
        });

        // update contrast indicators
        if (variable.contrastVariables) {
            variable.contrastVariables.forEach((cv) => {
                cv.UpdateContrast(variable.rgb);
            });
        }
        if (variable.contrastVariableOfOtherColors) {
            variable.contrastVariableOfOtherColors.forEach((cv) => {
                cv.UpdateContrast();
            });
        }

        this.colorPicker.updateColorIfVariableWasChangedOutside(variable);
    },

    //#endregion

    openPreviewWindow: function (pageName) {
        if (!pageName) {
            pageName = document.getElementById('tcolor-editor-preview-page-name').value;
            if (pageName)
                localStorage.setItem('tcolor-editor-preview-page-name', pageName);
        }
        if (!pageName) return;

        const rect = localStorage.getItem('theme-creator-popup-rect');
        let location = rect ? `, ${rect}` : '';

        const w = window.open(pageName, '', 'popup' + location);
        if (!w) {
            console.log(`preview popup of page name ${pageName} couldn't be opened`);
            return;
        }

        w.addEventListener('DOMContentLoaded', () => {
            const styleElement = this.addPreviewStyleElement(w.document);
            w.document.body.style.setProperty('background', getComputedStyle(document.body).background);

            this.variableInfo.forEach((v) => {
                // apply current values to preview
                const varValue = v.valueStringOutput();
                if (varValue)
                    styleElement.setProperty(v.name, varValue);
                // if variable has rgb variant, also save that
                const varValueRgb = v.hasFormatRgb ? v.valueColorAsCommaRgbString() : null;
                if (varValueRgb)
                    styleElement.setProperty(v.name + '--rgb', varValueRgb);
                const iconLinkFilter = v.name === '--wiki-content-link-color' ? this.filterCreator.calculateFilter(v.rgb).filterString : null;
                if (iconLinkFilter)
                    styleElement.setProperty('--wiki-icon-to-link-filter', iconLinkFilter);
            });
            this.previewPopups.push({ w: w, s: styleElement });
            this.previewPopups = this.previewPopups.filter((p) => !p.w.closed);
        });
    },

    saveDefaultPopupLocation: function () {
        const p = this.previewPopups.find((pi) => !pi.w.closed);
        if (p)
            localStorage.setItem('theme-creator-popup-rect', `screenX=${p.w.screenX}, screenY=${p.w.screenY}, width=${p.w.innerWidth}, height=${p.w.innerHeight}`);
    },

    /**
     * Default suggestions for variable definitions, e.g. hover being slightly lighter than non-hover.
     * For a suggestion to be appliable the according variables need to be defined.
     * The object contains either an explicit color for light and dark view
     * or an indirect definition with optional adjustments (invert, hueRotate, saturationFactor, lightnessFactor)
     */
    variableSuggestions: {
        '--wiki-body-dynamic-color': { 'light': '#000', 'dark': '#fff' },
        '--wiki-body-dynamic-color--inverted': { 'indirect': 'var(--wiki-body-dynamic-color)', 'invert': 1 },
        '--wiki-body-dynamic-color--secondary': { 'light': '#333', 'dark': '#ccc' },
        '--wiki-body-dynamic-color--secondary--inverted': { 'indirect': 'var(--wiki-body-dynamic-color--secondary)', 'invert': 1 },
        '--wiki-content-background-color--secondary': { 'indirect': 'var(--wiki-content-background-color)', 'saturationFactor': 0.9 },
        '--wiki-content-link-color--visited': { 'indirect': 'var(--wiki-content-link-color)' },
        '--wiki-content-link-color--hover': { 'indirect': 'var(--wiki-content-link-color)' },
        '--wiki-content-redlink-color': { 'light': '#ba0000', 'dark': '#fc5b4f' },
        '--wiki-content-text-mix-color': { 'indirect': 'color-mix(in srgb,var(--wiki-content-background-color),var(--wiki-content-text-color) 62%)' },
        '--wiki-content-text-mix-color-95': { 'indirect': 'color-mix(in srgb,var(--wiki-content-background-color) 95%,var(--wiki-content-text-color))' },
        '--wiki-content-dynamic-color': { 'light': '#000', 'dark': '#fff' },
        '--wiki-content-dynamic-color--inverted': { 'indirect': 'var(--wiki-content-dynamic-color)', 'invert': 1 },
        '--wiki-content-dynamic-color--secondary': { 'light': '#333', 'dark': '#ccc' },
        '--wiki-content-dynamic-color--secondary--inverted': { 'indirect': 'var(--wiki-content-dynamic-color--secondary)', 'invert': 1 },
        '--wiki-content-heading-color': { 'indirect': 'var(--wiki-content-text-color)' },
        '--wiki-accent-color--hover': { 'indirect': 'var(--wiki-accent-color)', 'saturationFactor': 0.9 },
        '--wiki-sidebar-background-color': { 'indirect': 'var(--wiki-content-background-color)' },
        '--wiki-sidebar-border-color': { 'indirect': 'var(--wiki-content-border-color)' },
        '--wiki-sidebar-link-color': { 'indirect': 'var(--wiki-content-link-color)' },
        '--wiki-sidebar-link-color--hover': { 'indirect': 'var(--wiki-content-link-color--hover)' },
        '--wiki-sidebar-heading-color': { 'indirect': 'var(--wiki-content-heading-color)' },
        '--wiki-navigation-background-color': { 'indirect': 'var(--wiki-content-background-color--secondary)' },
        '--wiki-navigation-background-color--secondary': { 'indirect': 'var(--wiki-content-background-color)' },
        '--wiki-navigation-border-color': { 'indirect': 'var(--wiki-content-border-color)' },
        '--wiki-navigation-text-color': { 'indirect': 'var(--wiki-content-link-color)' },
        '--wiki-navigation-text-color--hover': { 'indirect': 'var(--wiki-content-link-color--hover)' },
        '--wiki-navigation-selected-background-color': { 'indirect': 'var(--wiki-content-background-color)' },
        '--wiki-navigation-selected-border-color': { 'indirect': 'var(--wiki-navigation-border-color)' },
        '--wiki-navigation-selected-text-color': { 'indirect': 'var(--wiki-content-text-color)' },
        '--wiki-neutral-color': { 'indirect': 'var(--wiki-content-text-mix-color)' }
    },

    /**
     * Returns a user readable text of the suggestion.
     * @param {object} suggestion 
     */
    createSuggestionInfo: function (suggestion) {
        if (suggestion.light || suggestion.dark) {
            return `light: ${suggestion.light}, dark: ${suggestion.dark}`;
        }
        if (!suggestion.indirect) return 'undefined';

        let texts = [];
        texts.push(suggestion.indirect);
        if (suggestion.invert != undefined)
            texts.push(`invert: ${suggestion.invert}`);
        if (suggestion.hueRotate != undefined)
            texts.push(`hueRotate: ${suggestion.hueRotate}`);
        if (suggestion.saturationFactor != undefined)
            texts.push(`saturationFactor: ${suggestion.saturationFactor}`);
        if (suggestion.lightnessFactor != undefined)
            texts.push(`lightnessFactor: ${suggestion.lightnessFactor}`);
        return texts.join(', ');
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

            if (hslIn[2] == 0) {
                // no light == black, no filter needed
                return { step: 0, filterString: `none`, error: 0, totalSteps: 0, input: rgbIn };
            }
            if (hslIn[1] == 0) {
                // no saturation, only invert is needed
                return { step: 0, filterString: `invert(${hslIn[2] / 100})`, error: 0, totalSteps: 0, input: rgbIn };
            }

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
    document.addEventListener('DOMContentLoaded', () => {
        themeColorEditor.initialize();
    });
} else {
    themeColorEditor.initialize();
}
