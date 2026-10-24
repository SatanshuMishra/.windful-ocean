local wezterm = require 'wezterm'
local config = wezterm.config_builder()

-- Text Customization
-- config.font = wezterm.font('CommitMono', { weight = 'Regular', italic = false });
-- config.line_height = 1.05
config.font = wezterm.font_with_fallback {
	{
		family = 'JetBrainsMono Nerd Font Mono',
		weight = 'Regular',
		harfbuzz_features = { 'calt=1', 'clig=1', 'liga=1' }, -- Enable ligatures
	},
	'JetBrains Mono',
}

-- Enable font ligatures
config.harfbuzz_features = { 'calt=1', 'clig=1', 'liga=1' }
config.line_height = 1.00
config.font_size = 15.0


config.window_decorations = 'INTEGRATED_BUTTONS|RESIZE'
config.show_tabs_in_tab_bar = false
config.show_new_tab_button_in_tab_bar = false
config.window_background_opacity = 1
config.window_padding = { left = 20, right = 20, top = 30, bottom = 0 }
config.color_scheme = 'Catppuccin Mocha'

local scheme_background = wezterm.color.get_builtin_schemes()[config.color_scheme].background
config.window_frame = {
	active_titlebar_bg = scheme_background,
	inactive_titlebar_bg = scheme_background,
	active_titlebar_border_bottom = scheme_background,
	inactive_titlebar_border_bottom = scheme_background,
}

config.keys = {
	{
		key = 't',
		mods = 'SUPER',
		action = wezterm.action.DisableDefaultAssignment,
	}
}

local window_screen_fraction = 0.7

wezterm.on('gui-startup', function(cmd)
	local screen = wezterm.gui.screens().active
	local width = screen.width * window_screen_fraction
	local height = screen.height * window_screen_fraction
	local _, _, window = wezterm.mux.spawn_window(cmd or {})
	local gui_window = window:gui_window()
	gui_window:set_inner_size(width, height)
	gui_window:set_position(screen.x + (screen.width - width) / 2, screen.y + (screen.height - height) / 2)
end)

return config
