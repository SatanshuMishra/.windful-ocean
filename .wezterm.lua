local wezterm = require 'wezterm'
local config = wezterm.config_builder()

-- Text Customization
-- config.font = wezterm.font('CommitMono', { weight = 'Regular', italic = false });
-- config.line_height = 1.05
config.font = wezterm.font_with_fallback {
	{
		family = 'JetBrains Mono',
		weight = 'Regular',
		harfbuzz_features = { 'calt=1', 'clig=1', 'liga=1' }, -- Enable ligatures
	},
	'JetBrains Mono',
}

-- Enable font ligatures
config.harfbuzz_features = { 'calt=1', 'clig=1', 'liga=1' }
config.line_height = 1.00
config.font_size = 8.0


-- Hide Title Bar
config.window_decorations = "RESIZE"

-- Hide Tab Bar
config.enable_tab_bar = false
config.window_background_opacity = 1
config.window_padding = { left = 20, right = 20, top = 30, bottom = 0 }
config.colors = {
	background = '#000000',
	cursor_border = '#007FFF',
	cursor_bg = '#007FFF'
}

config.keys = {
	{
		key = 't',
		mods = 'SUPER',
		action = wezterm.action.DisableDefaultAssignment,
	}
}

return config
