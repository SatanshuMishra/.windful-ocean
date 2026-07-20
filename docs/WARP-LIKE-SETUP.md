# Warp-Like Terminal Setup Guide

This guide documents the complete transformation of WezTerm to look and work like Warp terminal.

## Overview

The Windful Ocean dotfiles now include a comprehensive Warp-like terminal experience using:

- **WezTerm** - Terminal emulator with Warp-like appearance and keybindings
- **Starship** - Minimal, modern prompt inspired by Warp's aesthetic
- **Zsh plugins** - Enhanced autosuggestions, syntax highlighting, and completions

## Features Implemented

### ✅ Fully Replicated

| Feature | Implementation |
|---------|----------------|
| **Modern dark theme** | Custom color scheme matching Warp's aesthetic (`#1A1B26` background) |
| **Minimal window chrome** | Title bar removed, resize handles only |
| **Comfortable padding** | 16px padding with subtle transparency |
| **Clean tab bar** | Fancy tab bar, auto-hidden when single tab |
| **Blinking bar cursor** | Warp-style cursor with amber accent |
| **Warp keybindings** | CMD+D split, CMD+P palette, CMD+K clear, etc. |
| **Pane management** | Full split/navigate/zoom/resize support |
| **Command palette** | Via `CMD+P` (ActivateCommandPalette) |
| **Quick command input** | Via `CMD+SHIFT+P` (PromptInputLine) |
| **Syntax highlighting** | Warp-inspired colors via zsh-syntax-highlighting |
| **Autosuggestions** | Subtle gray suggestions, accept with right arrow |
| **Fuzzy search** | FZF integration with Warp-like styling |
| **Minimal prompt** | Starship with directory, git, and language info |

### ⚠️ Partially Replicated

| Feature | Limitation |
|---------|------------|
| **IDE-like input editing** | Limited to shell capabilities (zsh line editor) |
| **Smart completions** | Via fzf-tab and zsh-completions (not as contextual as Warp) |
| **Synchronized input** | Would require custom Lua scripting |

### ❌ Not Possible

| Feature | Reason |
|---------|--------|
| **True Blocks UI** | Terminal emulators don't group command+output as navigable blocks |
| **Error underlining** | Terminals cannot parse commands before execution |
| **Input position modes** | Cannot pin prompt to top or reverse flow |
| **AI/Agent mode** | Proprietary Warp feature |
| **Warp Drive** | Cloud sync feature specific to Warp |

## Prerequisites

### Required Dependencies

#### macOS (Homebrew)

```bash
# Core tools
brew install wezterm starship fzf zoxide

# Fonts (required for icons)
brew tap homebrew/cask-fonts
brew install --cask font-jetbrains-mono-nerd-font
brew install --cask font-symbols-only-nerd-font

# Optional but recommended
brew install eza bat fd ripgrep
```

#### Linux (Ubuntu/Debian)

```bash
# WezTerm
curl -fsSL https://apt.fury.io/wez/gpg.key | sudo gpg --yes --dearmor -o /usr/share/keyrings/wezterm-fury.gpg
echo 'deb [signed-by=/usr/share/keyrings/wezterm-fury.gpg] https://apt.fury.io/wez/ * *' | sudo tee /etc/apt/sources.list.d/wezterm.list
sudo apt update && sudo apt install wezterm

# Starship
curl -sS https://starship.rs/install.sh | sh

# FZF
sudo apt install fzf

# Zoxide
curl -sS https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | bash

# Fonts - download from https://www.nerdfonts.com/
mkdir -p ~/.local/share/fonts
# Download JetBrainsMono Nerd Font and extract to ~/.local/share/fonts
fc-cache -fv

# Optional but recommended
sudo apt install exa bat fd-find ripgrep
```

#### Arch Linux

```bash
sudo pacman -S wezterm starship fzf zoxide
sudo pacman -S ttf-jetbrains-mono-nerd ttf-nerd-fonts-symbols

# Optional
sudo pacman -S eza bat fd ripgrep
```

## Installation

1. **Clone the dotfiles repository** (if not already done):
   ```bash
   git clone https://github.com/satanshumishra/windful-ocean.git ~/.dotfiles
   cd ~/.dotfiles
   ```

2. **Install the dotfiles**:
   ```bash
   ./scripts/install_config.sh
   ```

3. **Install dependencies** (see Prerequisites above)

4. **Restart your terminal** or run:
   ```bash
   source ~/.zshrc
   ```

## Configuration Files

### WezTerm Configuration

**File**: `~/.config/wezterm/wezterm.lua`

**IMPORTANT**: WezTerm looks for its config file in this order:
1. `$WEZTERM_CONFIG_FILE` environment variable
2. `$XDG_CONFIG_HOME/wezterm/wezterm.lua` (if `$XDG_CONFIG_HOME` is set)
3. `~/.config/wezterm/wezterm.lua` (preferred location)
4. `~/.wezterm.lua` (fallback)

The dotfiles repository uses `~/.config/wezterm/wezterm.lua` as the standard location.

Key settings:
- **Font**: JetBrains Mono with ligatures
- **Font size**: 14.0
- **Line height**: 1.2
- **Background**: `#1A1B26` with 95% opacity
- **Cursor**: Blinking bar, amber color (`#F5A97F`)
- **Padding**: 16px left/right/top, 8px bottom

### Starship Prompt

**File**: `~/.config/starship.toml`

The prompt shows:
- Current directory (truncated to 3 levels)
- Git branch and status
- Active language versions (Node, Python, Rust, Go, Java)
- Docker/Kubernetes context
- Command duration (if > 2 seconds)
- Time (in right prompt)

### Zsh Enhancements

**File**: `~/.zshrc`

Plugins loaded:
- `zsh-syntax-highlighting` - Colors commands as you type
- `zsh-autosuggestions` - Ghost text suggestions from history
- `zsh-completions` - Extended completions
- `zsh-history-substring-search` - Better history search
- `fzf-tab` - Fuzzy completion selection

## Troubleshooting

### WezTerm Config Not Loading

If WezTerm styling is not being applied:

1. **Verify the config file location**:
   ```bash
   ls -la ~/.config/wezterm/wezterm.lua
   ```

2. **Check if symlink is correct**:
   ```bash
   readlink -f ~/.config/wezterm/wezterm.lua
   ```
   Should point to: `/Users/yourusername/Documents/DevLabs/.windful-ocean/.config/wezterm/wezterm.lua`

3. **Check for broken symlinks**:
   ```bash
   file ~/.config
   ```
   If it shows "broken symbolic link", remove it:
   ```bash
   rm ~/.config  # Only if it's a broken symlink!
   ```

4. **Re-run Stow installation**:
   ```bash
   cd ~/.dotfiles
   ./scripts/install_config.sh
   ```

5. **Verify WezTerm can find the config**:
   - Open WezTerm
   - Press `CMD+SHIFT+L` to open debug overlay
   - Look for "Config file" line - it should show the path to your config

6. **Check for syntax errors**:
   ```bash
   lua ~/.config/wezterm/wezterm.lua
   ```
   If there are errors, fix them in the source file.

### Icons Not Displaying

1. Ensure Nerd Fonts are installed
2. Set your terminal font to a Nerd Font variant
3. Restart WezTerm

### Slow Shell Startup

1. Profile with: `zsh -xvs 2>&1 | ts -i "%.s" | head -50`
2. Consider lazy-loading heavy tools (nvm, conda)
3. Disable unused plugins

### Colors Look Wrong

1. Ensure WezTerm is using WebGpu: `config.front_end = "WebGpu"`
2. Check terminal supports true color: `echo $COLORTERM` should be `truecolor`
3. Verify your color scheme is set correctly

### FZF Not Working

1. Ensure FZF is installed: `which fzf`
2. Reload shell: `source ~/.zshrc`
3. Check FZF integration: `eval "$(fzf --zsh)"`

## Keybindings

### Pane Management

| Keybinding | Action |
|------------|--------|
| `CMD+D` | Split pane vertically (new pane on right) |
| `CMD+SHIFT+D` | Split pane horizontally (new pane below) |
| `CMD+]` | Navigate to next pane |
| `CMD+[` | Navigate to previous pane |
| `CMD+CTRL+H/J/K/L` | Navigate panes (Vim-style) |
| `CMD+SHIFT+Enter` | Toggle pane zoom (maximize/minimize) |
| `CMD+W` | Close current pane |
| `CMD+CTRL+Arrows` | Resize current pane |

### Tab Management

| Keybinding | Action |
|------------|--------|
| `CMD+T` | New tab |
| `CMD+SHIFT+W` | Close tab |
| `CMD+SHIFT+{` | Previous tab |
| `CMD+SHIFT+}` | Next tab |
| `CMD+1-9` | Switch to tab 1-9 |

### Terminal Operations

| Keybinding | Action |
|------------|--------|
| `CMD+P` | Open command palette |
| `CMD+SHIFT+P` | Quick command input |
| `CMD+K` | Clear screen and scrollback |
| `CMD+F` | Search in scrollback |
| `CMD+C` | Copy |
| `CMD+V` | Paste |
| `CMD+=` | Increase font size |
| `CMD+-` | Decrease font size |
| `CMD+0` | Reset font size |
| `CMD+CTRL+F` | Toggle fullscreen |
| `CMD+SHIFT+R` | Reload configuration |

### Shell Keybindings

| Keybinding | Action |
|------------|--------|
| `Right Arrow` | Accept autosuggestion |
| `Ctrl+E` | Accept autosuggestion |
| `Ctrl+Space` | Accept autosuggestion |
| `Up Arrow` | History substring search up |
| `Down Arrow` | History substring search down |
| `Alt+Left` | Move word backward |
| `Alt+Right` | Move word forward |
| `Ctrl+R` | FZF history search |
| `Ctrl+T` | FZF file search |
| `Alt+C` | FZF directory search |

## Customization

### Switching to Powerlevel10k Prompt

If you prefer Powerlevel10k over Starship:

1. Edit `~/.zshrc`
2. Comment out the Starship line
3. Uncomment the Powerlevel10k line
4. Restart your shell

### Enabling Block Separators

To add visual separation between commands (approximating Warp blocks):

1. Edit `~/.zshrc`
2. Uncomment the "WARP-LIKE BLOCK SEPARATORS" section
3. Restart your shell

### Changing Colors

- **WezTerm colors**: Edit `config.colors` in `~/.config/wezterm/wezterm.lua`
- **Prompt colors**: Edit `~/.config/starship.toml`
- **Syntax highlighting colors**: Edit `ZSH_HIGHLIGHT_STYLES` in `~/.zshrc`
- **FZF colors**: Edit `FZF_DEFAULT_OPTS` in `~/.zshrc`

### Changing Fonts

Edit `~/.config/wezterm/wezterm.lua`:

```lua
config.font = wezterm.font_with_fallback({
    {
        family = "Your Font Name",
        weight = "Regular",
    },
    "Symbols Nerd Font Mono",
})
config.font_size = 14.0
```

## Comparison with Warp

| Aspect | This Setup | Warp |
|--------|-----------|------|
| **Performance** | Fast (native terminal) | Fast (Rust-based) |
| **Appearance** | Very similar | Native |
| **Keybindings** | Identical | Native |
| **Blocks UI** | Approximated | Native |
| **AI Features** | Not available | Native |
| **Cross-platform** | macOS, Linux | macOS, Linux |
| **Privacy** | Fully local | Cloud features optional |
| **Cost** | Free | Free (paid features) |
| **Customization** | Highly flexible | Limited |

## Resources

- [WezTerm Documentation](https://wezfurlong.org/wezterm/)
- [Starship Documentation](https://starship.rs/)
- [Warp Terminal](https://www.warp.dev/)
- [Nerd Fonts](https://www.nerdfonts.com/)
