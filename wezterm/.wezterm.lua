local wezterm = require 'wezterm'

local config = {}

if wezterm.config_builder then
  config = wezterm.config_builder()
end

config.font = wezterm.font 'Hasklig'

config.window_padding = { left = 20, right = 20, top = 40, bottom = 40 }

config.colors = {
  background = '#000c18',
}

config.font_size = 18.0

function tab_title(tab_info)
  local title = tab_info.tab_title
  if title and #title > 0 then
    return title
  end
  return tab_info.active_pane.title
end

wezterm.on('format-tab-title', function(tab, _, _, _, _, max_width)
  local title = tab_title(tab)
  title = title

  -- TAB THEME SETTINGS

  local background_color, foreground_color
  if tab.is_active then
    background_color = '#000c18'  -- BACKGROUND COLOR
	foreground_color = '#0090ff'  -- TEXT COLOR  
  else
    background_color = '#000c18'  -- INACTIVE BACKGROUND COLOR
	foreground_color = '#444455'  -- INACTIVE TEXT COLORS
  end

  return {
    { Background = { Color = background_color } },
    { Foreground = { Color = foreground_color } },
    { Text = title }
  }
end)

config.window_frame = {
  font_size = 16.0,
  active_titlebar_bg = '#000c18',
}

return config
