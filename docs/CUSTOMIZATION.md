# Customization Guide

This guide explains how to personalize and extend my dotfiles configuration.

## Configuration Structure

Understanding how I've organized everything will help you make targeted changes:

```
.config/nvim/
├── lua/
│   ├── core/          # Core Neovim settings
│   │   ├── options.lua    # vim.opt settings
│   │   ├── keymaps.lua    # global keymaps
│   │   └── autocmds.lua   # autocommands
│   ├── plugins/       # Plugin configurations
│   │   ├── init.lua       # plugin manager setup
│   │   ├── mini.lua       # mini.nvim suite
│   │   ├── lsp/          # LSP configuration
│   │   └── ...
│   └── themes/        # Theme configuration
```

---

## Quick Customizations

### Change Color Schemes

Neovim Themes:
Edit `.config/nvim/lua/themes/init.lua`:
```lua
-- Available themes: catppuccin, tokyonight, rose-pine, oxocarbon
vim.cmd.colorscheme("catppuccin-mocha")  -- Change this line
```

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

### Add Your Own Neovim Plugins

1. Create your own plugin file:
```bash
touch ~/.config/nvim/lua/plugins/my-plugins.lua
```

2. Add your plugin configuration:
```lua
-- ~/.config/nvim/lua/plugins/my-plugins.lua
return {
    {
        'your-username/your-plugin',
        config = function()
            require('your-plugin').setup({
                -- your configuration
            })
        end,
    },
}
```

3. Import in my plugin loader:
Edit my `.config/nvim/lua/plugins/init.lua`:
```lua
require('lazy').setup({
    { import = "plugins.my-plugins" },  -- Add this line
    -- ... other imports
})
```

### Customize My LSP Servers

Add your own language server:
Edit my `.config/nvim/lua/plugins/lsp/servers.lua`:
```lua
-- Add to the setup function
lspconfig.your_lsp.setup({
    capabilities = capabilities,
    on_attach = on_attach,
    settings = {
        -- LSP-specific settings
    },
})
```

Install via Mason:
```vim
:MasonInstall your-language-server
```

### Add Your Own Keybindings

Add global Neovim keymaps:
Edit my `.config/nvim/lua/core/keymaps.lua`:
```lua
-- Add your custom keymaps
vim.keymap.set('n', '<leader>x', '<cmd>YourCommand<cr>', { desc = 'Your description' })
```

Add plugin-specific keymaps:
Add to the relevant plugin configuration:
```lua
keys = {
    { '<leader>my', '<cmd>MyCommand<cr>', desc = 'My custom command' },
},
```

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

For Neovim (example):
```lua
-- ~/.config/nvim/lua/themes/my-theme.lua
local M = {}

function M.setup()
    -- Define your colors
    local colors = {
        bg = "#1e1e2e",
        fg = "#cdd6f4",
        -- ... more colors
    }
    
    -- Apply highlights
    vim.api.nvim_set_hl(0, "Normal", { bg = colors.bg, fg = colors.fg })
    -- ... more highlights
end

return M
```

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

### Optimize My Neovim Setup

Lazy loading:
```lua
-- Only load plugins when needed
{
    'expensive-plugin',
    lazy = true,
    event = 'BufReadPost',
    cmd = { 'PluginCommand' },
    ft = { 'javascript', 'typescript' },
}
```

Disable unused features:
```lua
-- In core/options.lua
vim.opt.backup = false      -- Disable backup files
vim.opt.writebackup = false -- Disable backup during write
vim.opt.swapfile = false    -- Disable swap files
```

### Optimize My Shell

Lazy load heavy plugins:
```bash
# Load nvm only when needed
export NVM_LAZY_LOAD=true

# Load conda only when needed
export CONDA_AUTO_ACTIVATE_BASE=false
```

### Profile Startup Performance

Neovim startup time:
```bash
nvim --startuptime startup.log
# Analyze startup.log for slow components
```

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

Project-specific LSP settings (example):
```lua
-- .nvim.lua in project root
vim.opt_local.shiftwidth = 2
vim.opt_local.tabstop = 2

-- Project-specific LSP settings
require('lspconfig').tsserver.setup({
    settings = {
        typescript = {
            preferences = {
                importModuleSpecifier = "relative"
            }
        }
    }
})
```

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
git remote add upstream https://github.com/satanshumishra/windful-ocean.git

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