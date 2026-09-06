# Customization Guide

This guide explains how to personalize and extend my dotfiles configuration.

## Configuration Structure

This guide covers customizations that span more than one tool. For the Neovim configuration's own internal structure, plugin inventory and file layout, see [.config/nvim/README.md](../.config/nvim/README.md#file-structure) — it is the single home for everything Neovim-specific.

---

## Quick Customizations

### Change Color Schemes

Neovim theme: see [Theme Customization](../.config/nvim/README.md#theme-customization) in the Neovim README.

Terminal Themes:
WezTerm config in `.wezterm.lua`:
```lua
config.colors = {
    background = '#1e1e2e',  -- Catppuccin mocha
    -- Or try:
    -- background = '#1a1b26',  -- Tokyo Night
    -- background = '#191724',  -- Rose Pine
}
```

### Modify Prompts

Switch to Starship:
Edit `.zshrc`:
```bash
# Comment out Powerlevel10k
# zinit ice depth=1; zinit light romkatv/powerlevel10k

# Uncomment Starship
eval "$(starship init zsh)"
```

Customize Starship:
Edit `.config/starship.toml` - see [Starship Config](https://starship.rs/config/)

### Adjust Font and Icons

WezTerm Font:
Edit `.wezterm.lua`:
```lua
config.font = wezterm.font_with_fallback {
    {
        family = 'FiraCode Nerd Font',  -- Change font here
        weight = 'Regular',
    },
    'JetBrains Mono',
}
config.font_size = 12.0  -- Adjust size
```

---

## Advanced Customizations

Adding a Neovim plugin, adding a language server, or adding a Neovim keybinding are all Neovim-specific changes — see [Customization Guide](../.config/nvim/README.md#customization-guide) in the Neovim README for all three.

### Environment-Specific Customizations

Create your own local overrides:
```bash
# Shell customizations
touch ~/.zshrc.local

# Git customizations  
touch ~/.gitconfig.local
```

Example `.zshrc.local`:
```bash
# Work-specific aliases
alias work-server='ssh user@work.example.com'
alias work-vpn='sudo openvpn /path/to/work.ovpn'

# Custom environment variables
export WORK_PROJECT_DIR="$HOME/work-projects"

# Additional PATH entries
export PATH="$HOME/work-tools/bin:$PATH"
```

Example `.gitconfig.local`:
```ini
[user]
    email = work-email@company.com
    signingkey = WORK_GPG_KEY_ID

[includeIf "gitdir:~/work-projects/"]
    path = ~/.gitconfig-work
```

---

## Tool-Specific Customizations

### Customize My Tmux Setup

Customize the status bar:
Edit my `.config/tmux/tmux.conf`:
```bash
# Add custom status modules
set -g @catppuccin_window_left_separator ""
set -g @catppuccin_window_right_separator " "
set -g @catppuccin_window_middle_separator " █"
set -g @catppuccin_window_number_position "right"

# Custom status components
set -g @catppuccin_status_modules_right "directory user host session"
```

Add your own plugins:
```bash
# Add to plugin list
set -g @plugin 'your-username/your-tmux-plugin'

# Install with: Prefix + I
```

### Customize My Zsh Setup

Add your own functions:
Edit my `.zshrc` or create your own `.zshrc.local`:
```bash
# Custom function for project management
function work() {
    if [[ -z "$1" ]]; then
        cd "$WORK_PROJECT_DIR"
    else
        cd "$WORK_PROJECT_DIR/$1"
    fi
    
    # Auto-activate virtual environment if it exists
    if [[ -f "venv/bin/activate" ]]; then
        source venv/bin/activate
    fi
}

# Custom git function
function gcom() {
    git add .
    git commit -m "$*"
}
```

Add your own aliases:
```bash
# Development shortcuts
alias serve='python -m http.server 8000'
alias myip='curl -s https://httpbin.org/ip | jq -r .origin'
alias weather='curl -s "wttr.in?format=3"'

# Docker shortcuts
alias dcu='docker-compose up -d'
alias dcd='docker-compose down'
alias dcr='docker-compose restart'
```

### Customize FZF

Add your own FZF commands:
```bash
# Custom file search with preview
export FZF_CTRL_T_OPTS="
    --preview 'bat --color=always --style=header,grid --line-range :300 {}'
    --bind 'ctrl-/:change-preview-window(down|hidden|)'"

# Custom directory search
export FZF_ALT_C_OPTS="
    --preview 'tree -C {} | head -200'"

# Custom history search
export FZF_CTRL_R_OPTS="
    --preview 'echo {}' --preview-window up:3:hidden:wrap
    --bind 'ctrl-/:toggle-preview'"
```

---

## Theming and Appearance

### Create Your Own Theme

For Neovim, see [Theme Customization](../.config/nvim/README.md#theme-customization) in the Neovim README, which covers adding a new theme file under `lua/themes/`.

For terminals: You can create custom color schemes matching your preferred palette.

### Keep Theming Consistent

Use the same colors across all tools:
```lua
-- Define color palette in one place
local catppuccin_mocha = {
    base = "#1e1e2e",
    surface0 = "#313244",
    text = "#cdd6f4",
    blue = "#89b4fa",
    -- ... complete palette
}
```

I use these colors consistently across:
- Neovim colorscheme
- WezTerm configuration  
- Tmux status bar
- Starship prompt
- FZF color scheme

---

## Performance Tuning

For Neovim startup and memory tuning (lazy loading, disabling unused features), see [Performance Optimization](../.config/nvim/README.md#performance-optimization) in the Neovim README.

### Optimize My Shell

Lazy load heavy plugins:
```bash
# Load nvm only when needed
export NVM_LAZY_LOAD=true

# Load conda only when needed
export CONDA_AUTO_ACTIVATE_BASE=false
```

### Profile Startup Performance

Neovim startup time: see [Slow Startup](../.config/nvim/README.md#slow-startup) in the Neovim README's troubleshooting section.

Zsh startup time:
```bash
time zsh -i -c exit
# Add this to profile: zmodload zsh/zprof at the top of .zshrc
```

---

## Advanced Features

### Set Up Project-Specific Configurations

I use direnv for project environments:
```bash
# Install direnv
brew install direnv  # macOS
sudo apt install direnv  # Ubuntu

# Add to .zshrc (already included)
eval "$(direnv hook zsh)"
```

Create `.envrc` in your project:
```bash
# .envrc
export NODE_ENV=development
export DATABASE_URL=postgresql://localhost/myapp_dev
export PATH="./node_modules/.bin:$PATH"

# Load project-specific shell config
source_env_if_exists .env.local
```

### Custom LSP for Projects

For per-project Neovim and LSP settings via a `.nvim.lua` file, see [Project-Specific Configuration](../.config/nvim/README.md#project-specific-configuration) in the Neovim README.

### Advanced Git Setup

Set up custom git hooks:
```bash
# .git/hooks/pre-commit
#!/bin/bash
# Auto-format code before commit
npm run format
git add -A
```

Use conditional git configs:
```ini
# ~/.gitconfig
[includeIf "gitdir:~/work/"]
    path = ~/.gitconfig-work
[includeIf "gitdir:~/personal/"]
    path = ~/.gitconfig-personal
```

---

## Creating Your Own Dotfiles Fork

### Fork My Setup

1. Fork my repository
2. Clone your fork:
```bash
git clone https://github.com/yourusername/dotfiles.git ~/.dotfiles
```

3. Make your own changes
4. Update documentation
5. Test on clean system

### Keep Your Fork Updated

Stay up to date with my changes:
```bash
# Add upstream remote
git remote add upstream https://github.com/SatanshuMishra/.windful-ocean.git

# Update from upstream
git fetch upstream
git merge upstream/main

# Resolve conflicts in your customizations
```

### Share Your Own Version

Document what you've changed:
- Update the README.md with your modifications
- Create CHANGELOG.md for version history
- Add screenshots of your customized setup

Make your version portable:
- Test on multiple operating systems
- Add proper fallbacks for missing tools
- Include installation instructions

---

## Tips and Best Practices

### Organization
- Keep customizations in separate files when possible
- Use comments to explain non-obvious configurations
- Version control your changes with meaningful commit messages

### Testing
- Test configurations on clean systems/VMs
- Use `--dry-run` flags when available
- Keep backups before major changes

### Documentation
- Document custom keybindings and aliases
- Explain why certain choices were made
- Update documentation when adding features

### Maintenance
- Regularly update plugins and tools
- Remove unused configurations
- Monitor performance impact of customizations

Remember: The best dotfiles are the ones that fit YOUR workflow. I've designed this setup to be easily customizable - don't hesitate to modify anything to suit your needs!