# obsidian-embed-tablet-notes

This obsidian plugin allows you to embed your tablet notes into your obsidian notes.

Supported apps:

- Notability $\implies$ Via share link


Syntax:


```
```notability
{
"id": "...",
"page": 15,
"rect": [50,180, 80, 200]
 }
"```
```


Explanation:

- `id`: The id of the note you want to embed (from the share link)
- `page`: The page number you want to embed
- `rect`: The rectangle you want to embed (in the format `[x1, y1, x2, y2]`; optional if you want to embed the whole page)

## Installation

You can install the plugin by downloading the latest release. Then, you can install the plugin by going drag and dropping the downloaded file into the obsidian plugins folder.

## Author

- Henri Schulz

## License

This project is licensed under the MIT License



