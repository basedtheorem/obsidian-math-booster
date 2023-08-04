# Equation Numbering

When you insert a link to a math equation block (`[[#^block-ID]]` or `[[note-title#^block-ID]]`), this plugin automatically detects it and assigns an equation number to the equation. 
This can take a few seconds because this plugin has to wait until Obsidian finishes updating the metadata caches.

As an exception, if your equation has `\tag{...}` already, it will be retained as is.

Note that you have to include at least one line break between `$$ ... $$` if you want the equation to be numbered.
Otherwise, Obsidian will not recognize it as a math block.
Also note that you cannot insert a link to equations in callouts or blockquotes. 
This is a inherent limitation of Obsidian, rather than this plugin.[^1]

[^1]: Technically, it is possible to display an equation number for an equation in callouts. However, I think there is no point to do it if the equation cannot be referenced.

[demo]

## The `align` Environment

You can choose whether multi-line equations in an `align` environment are numbered _collectively as a group_ or _individually_.

Go to the "Number line by line in align" section in the plugin preferences to change the current setting.

[image]