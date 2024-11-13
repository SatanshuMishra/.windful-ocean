local wezterm = require 'wezterm'
local config = wezterm.config_builder()

-- Text Customization
config.font = wezterm.font 'JetBrains Mono'
config.font_size = 16.0


-- Hide Title Bar
config.window_decorations = "RESIZE"

-- Hide Tab Bar
config.enable_tab_bar = false
config.window_background_opacity = 1
config.window_padding = { left = 20, right = 20, top = 40, bottom = 40 }
config.colors = {
  background = '#00070E',
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