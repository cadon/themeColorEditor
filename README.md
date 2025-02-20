# Theme Color Editor
Theme color editor for wiki.gg wikis.

## Features
* Adjust color variables of wiki themes with a color picker or indirect definitions based on other colors
* Live preview of the set colors on other wiki pages
* Display of needed contrasts between colors
* buttons for automatic contrast fixing

## How to use
Run this script in the browser console of a wiki page with a specific table of defined color variables, e.g. on `...wiki.gg/wiki/MediaWiki:Common.css`. The variable table needs to have the following format

```html
<table>
  <tr>
    <th>Variable name</th>
    <th>Color</th>
    <th>Notes</th>
    <th>Test contrast against these variables</th>
  </tr>
  <tr>
    <td>--wiki-body-background-color</td>
    <td style="background-color:var(--wiki-body-background-color);"></td>
    <td>The background color behind the background image.</td>
    <td style="background-color:var(--wiki-body-background-color);">
        <p>
            <span style="color:var(--wiki-body-dynamic-color);">--wiki-body-dynamic-color</span><br>
            <span style="color:var(--wiki-body-dynamic-color--secondary);">--wiki-body-dynamic-color--secondary</span>
        </p>
    </td>
  </tr>
</table>
```

## Options
The needed contrast for a variable in the contrast column defaults to the [recommended value of 4.5](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). This needed contrast can be adjusted by setting the `data-min-contrast` attribute of the span element of the variable to the desired value. E.g. to have a contrast variable that needs a contrast of only 3, use

```html
<span style="color:var(--var-name);" data-min-contrast="3">--var-name</span>
```
